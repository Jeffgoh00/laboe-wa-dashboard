import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const supabaseUrl = mustEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const explicitDate = process.env.COLLECTION_DATE || "";
const explicitMerchant = process.env.MERCHANT_ID || "";
const explicitSearchRequestId = process.env.SEARCH_REQUEST_ID || "";
const historyFilePath = path.join("lead_outputs", "supabase-history.json");

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function supabase(method, table, { query = "", body, prefer } = {}) {
  const url = `${supabaseUrl}/rest/v1/${table}${query}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "resolution=merge-duplicates,return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${table} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

// 解析"要为哪个商户、哪天采集"。
// 优先用 dispatch 传进来的 MERCHANT_ID + COLLECTION_DATE；
// 否则（cron 兜底）扫最旧一条 status=requested 的 search_request。
async function resolveRequest() {
  if (explicitMerchant && explicitDate) {
    return { merchant_id: explicitMerchant, run_date: explicitDate, search_request_id: explicitSearchRequestId || null, target_leads: null };
  }
  const rows = await supabase("GET", "laboe_search_requests", {
    query: "?select=id,merchant_id,run_date,target_leads&status=eq.requested&order=created_at.asc&limit=1",
  });
  const sr = rows?.[0];
  if (!sr) return null;
  return { merchant_id: sr.merchant_id, run_date: sr.run_date, search_request_id: sr.id, target_leads: sr.target_leads };
}

async function getMerchantTarget(merchantId, fallback) {
  if (fallback) return Number(fallback);
  const rows = await supabase("GET", "laboe_merchants", { query: `?select=target_leads&merchant_id=eq.${encodeURIComponent(merchantId)}&limit=1` });
  return Number(rows?.[0]?.target_leads || 100);
}

async function setSearchStatus(id, status, extra = {}) {
  if (!id) return;
  await supabase("PATCH", "laboe_search_requests", {
    query: `?id=eq.${id}`,
    body: { status, ...extra },
  });
}

async function upsertRun(run) {
  await supabase("POST", "laboe_collection_runs?on_conflict=merchant_id,run_date", { body: run });
}

async function upsertRows(table, rows, conflictKey) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    await supabase("POST", `${table}?on_conflict=${conflictKey}`, { body: rows.slice(index, index + chunkSize) });
  }
}

// 全局去重：拉所有商户（含 OWNER）的全部 leads，作为"永不联系同一商家两次"的依据。
async function fetchAllExistingLeads() {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase("GET", "laboe_leads", {
      query: `?select=merchant_id,run_date,phone,business_name,google_maps_url,website_or_social_url,address,dedupe_key&order=id.asc&limit=${pageSize}&offset=${offset}`,
    });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

async function writeSupabaseHistoryFile(existingLeads) {
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });
  await fs.writeFile(historyFilePath, JSON.stringify({ newLeads: existingLeads }));
}

// list 编号在 (merchant_id, run_date) 范围内连续
async function getNextListIndex(merchantId, runDate) {
  const rows = await supabase("GET", "laboe_send_batches", {
    query: `?select=sender_profile&merchant_id=eq.${encodeURIComponent(merchantId)}&run_date=eq.${encodeURIComponent(runDate)}`,
  });
  let maxIndex = 0;
  for (const row of rows || []) {
    const match = String(row.sender_profile || "").match(/^WA(\d+)$/);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]));
  }
  return maxIndex + 1;
}

function prepareRequestImport(parsed, ctx, listIndex, existingDayPhones, existingDayCount) {
  const { merchantId, runDate, targetLeads } = ctx;
  const rawLeads = Array.isArray(parsed.newLeads) ? parsed.newLeads : Array.isArray(parsed.leads) ? parsed.leads : [];
  if (!rawLeads.length) throw new Error("Collector returned no leads.");

  const sourceLanes = Array.isArray(parsed.source_lanes) ? parsed.source_lanes : [];
  const profile = `WA${String(listIndex).padStart(2, "0")}`;
  const batchId = `${merchantId}-${profile}-${runDate}`;

  const freshLeads = rawLeads
    .filter((lead) => {
      const phone = String(lead.phone || "").replace(/\D/g, "");
      return phone && !existingDayPhones.has(phone);
    })
    .slice(0, targetLeads);
  if (!freshLeads.length) throw new Error("No new leads left after removing duplicates.");

  const leads = freshLeads.map((lead, index) => {
    const sequence = index + 1;
    const phone = String(lead.phone || "").replace(/\D/g, "");
    return {
      id: `${merchantId}-${runDate}-${profile}-${String(sequence).padStart(3, "0")}-${phone}`,
      merchant_id: merchantId,
      run_date: runDate,
      batch_id: batchId,
      sender_profile: profile,
      sender_sequence: sequence,
      priority_rank: lead.priority_rank || index + 1,
      business_name: lead.business_name || lead.businessName || "Unknown business",
      industry: lead.industry || "",
      source_platform: lead.source_platform || "",
      source_lane: lead.source_lane || "",
      google_maps_url: lead.google_maps_url || "",
      website_or_social_url: lead.website_or_social_url || "",
      address: lead.address || "",
      city: lead.city || "",
      country: lead.country || "Malaysia",
      phone,
      contact_channel: lead.contact_channel || "",
      contact_details: lead.contact_details || "",
      whatsapp_click_to_send_link: lead.whatsapp_click_to_send_link || lead.waLink || "",
      active_or_public_evidence: lead.active_or_public_evidence || "",
      observed_design_need: lead.observed_design_need || lead.observedNeed || "",
      recommended_angle: lead.recommended_angle || lead.angle || "",
      suggested_opening_message: lead.suggested_opening_message || lead.message || "",
      lead_grade: lead.lead_grade || "A",
      next_action: lead.next_action || "Send WhatsApp opener manually; mark status after sending.",
      dedupe_key: lead.dedupe_key || "",
      maps_category: lead.maps_category || "",
      rating: lead.rating || null,
      reviews: lead.reviews || null,
      send_status: lead.send_status || "pending",
      send_notes: lead.send_notes || "",
    };
  });

  const batch = {
    id: batchId,
    merchant_id: merchantId,
    run_date: runDate,
    sender_profile: profile,
    title: `List ${listIndex} — ${runDate}`,
    target_count: targetLeads,
    status: "open",
  };

  return {
    collection: {
      merchant_id: merchantId,
      run_date: runDate,
      target_leads: targetLeads,
      ready_leads: leads.length,
      assigned_leads: existingDayCount + leads.length,
      source_lanes_attempted: sourceLanes.length,
      active_source_lanes: sourceLanes.filter((lane) => Number(lane.accepted || 0) > 0).length,
      suppressed_candidates: parsed.suppress_count || 0,
      mode: leads.length >= targetLeads ? "Collection completed by GitHub Actions" : "Collection short by GitHub Actions",
      notes: `GitHub Actions added ${leads.length} new leads into ${batch.title}. Total for ${merchantId}/${runDate}: ${existingDayCount + leads.length}.`,
    },
    batches: [batch],
    leads,
  };
}

async function runCollector(runDate, targetLeads) {
  // 测试钩子：设了 COLLECTOR_STUB_JSON 就直接读它，跳过真实抓取（生产不设此 env）
  if (process.env.COLLECTOR_STUB_JSON) {
    const parsed = JSON.parse(await fs.readFile(process.env.COLLECTOR_STUB_JSON, "utf8"));
    parsed.date = parsed.date || runDate;
    return parsed;
  }
  const { stdout, stderr } = await execFileAsync(
    "node",
    ["scripts/laboe_collect_google_maps_leads.mjs", runDate, String(targetLeads)],
    { maxBuffer: 120 * 1024 * 1024 },
  );
  if (stderr) console.error(stderr);
  console.log(stdout);
  const summary = parseLastJsonObject(stdout);
  if (!summary.output_json) throw new Error("Collector did not return output_json.");
  const parsed = JSON.parse(await fs.readFile(summary.output_json, "utf8"));
  parsed.date = parsed.date || runDate;
  return parsed;
}

function parseLastJsonObject(stdout) {
  const text = stdout.trim();
  const start = text.lastIndexOf("\n{");
  const jsonText = start >= 0 ? text.slice(start + 1) : text.slice(text.indexOf("{"));
  return JSON.parse(jsonText);
}

async function main() {
  const request = await resolveRequest();
  if (!request) {
    console.log("No collection request found.");
    return;
  }

  const merchantId = request.merchant_id;
  const runDate = request.run_date;
  const searchRequestId = request.search_request_id;
  const targetLeads = await getMerchantTarget(merchantId, request.target_leads);
  const ctx = { merchantId, runDate, targetLeads };

  await setSearchStatus(searchRequestId, "processing");
  await upsertRun({
    merchant_id: merchantId,
    run_date: runDate,
    target_leads: targetLeads,
    mode: "Collection processing in GitHub Actions",
    notes: `Worker started at ${new Date().toISOString()}.`,
  });

  try {
    const existingLeads = await fetchAllExistingLeads();
    await writeSupabaseHistoryFile(existingLeads);
    // 同日同商户已有的 phone（用于 list 编号续号 + assigned 计数）；全局去重由 history 文件负责
    const existingDayLeads = existingLeads.filter(
      (row) => String(row.merchant_id) === String(merchantId) && String(row.run_date) === String(runDate),
    );
    const existingDayPhones = new Set(existingDayLeads.map((row) => String(row.phone || "").replace(/\D/g, "")).filter(Boolean));

    const collectorJson = await runCollector(runDate, targetLeads);
    const listIndex = await getNextListIndex(merchantId, runDate);
    const prepared = prepareRequestImport(collectorJson, ctx, listIndex, existingDayPhones, existingDayLeads.length);
    await upsertRun(prepared.collection);
    await upsertRows("laboe_send_batches", prepared.batches, "id");
    await upsertRows("laboe_leads", prepared.leads, "id");
    await setSearchStatus(searchRequestId, "completed", { result_count: prepared.leads.length });
    console.log(`Added ${prepared.leads.length} new leads for ${merchantId}/${runDate} (${prepared.batches[0].title}).`);
  } catch (error) {
    await upsertRun({
      merchant_id: merchantId,
      run_date: runDate,
      target_leads: targetLeads,
      mode: "Collection failed in GitHub Actions",
      notes: error.message.slice(0, 900),
    });
    await setSearchStatus(searchRequestId, "failed", { notes: error.message.slice(0, 400) });
    throw error;
  }
}

await main();
