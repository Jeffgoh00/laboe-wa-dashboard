import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// 卡在 processing 超过这个时长即视为孤儿（远大于真实一轮采集 ~15 分钟，且小于 GH job 60 分钟 timeout）。
const STALE_GRACE_MS = 20 * 60 * 1000;

const execFileAsync = promisify(execFile);

const supabaseUrl = mustEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const explicitDate = process.env.COLLECTION_DATE || "";
const explicitMerchant = process.env.MERCHANT_ID || "";
const explicitCampaign = process.env.CAMPAIGN_ID || "";
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
// 捡最旧一条 status=requested。抽出以便 cron 首取 + drain-loop 续取共用，且可单测（注入 db）。
async function pickOldestRequested(db) {
  const rows = await db("GET", "laboe_search_requests", {
    query: "?select=id,merchant_id,campaign_id,run_date,target_leads&status=eq.requested&order=created_at.asc&limit=1",
  });
  const sr = rows?.[0];
  if (!sr) return null;
  return {
    merchant_id: sr.merchant_id,
    campaign_id: sr.campaign_id || "design",
    run_date: sr.run_date,
    search_request_id: sr.id,
    target_leads: sr.target_leads,
  };
}

// 根因B 修复：把卡在 processing 且 updated_at 早于 (now - grace) 的请求退回 requested。
// 单并发下"有 worker 在跑 ⟹ 没有别的 worker 在跑"，看到的 processing 必是已死 run 留下的孤儿；
// grace 仅作 DB 写传播保险。依赖 laboe_search_requests.updated_at 触发器自动 bump（已核实存在）。
async function reclaimStaleProcessing(db, graceMs, nowMs) {
  const cutoffISO = new Date(nowMs - graceMs).toISOString();
  const rows = await db("PATCH", "laboe_search_requests", {
    query: `?status=eq.processing&updated_at=lt.${cutoffISO}`,
    body: { status: "requested", notes: "auto-reclaimed: stale processing (owning run died)" },
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function resolveRequest() {
  if (explicitMerchant && explicitDate) {
    return {
      merchant_id: explicitMerchant,
      campaign_id: explicitCampaign || "design",
      run_date: explicitDate,
      search_request_id: explicitSearchRequestId || null,
      target_leads: null,
    };
  }
  return pickOldestRequested(supabase);
}

// 根因C 修复：一个 run 尽量清空积压——处理完当前请求后继续捡 requested，直到清空或触及预算上限
// (maxDrain / budgetMs 防 GH job 60 分钟 timeout)。单并发下这保证"最后存活的那个 dispatch run"
// 能把连发时被 concurrency 挤掉 pending 的兄弟请求全部补跑完，不再看不稳的 cron 脸色。
async function drainQueue({ firstRequest, pickNext, process: processOne, now, maxDrain = 6, budgetMs = 45 * 60 * 1000 }) {
  const start = now();
  let request = firstRequest;
  let processed = 0;
  while (request) {
    await processOne(request);
    processed += 1;
    if (processed >= maxDrain) break;
    if (now() - start > budgetMs) break;
    request = await pickNext();
  }
  return processed;
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
  await supabase("POST", "laboe_collection_runs?on_conflict=merchant_id,campaign_id,run_date", { body: run });
}

async function upsertRows(table, rows, conflictKey) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    await supabase("POST", `${table}?on_conflict=${conflictKey}`, { body: rows.slice(index, index + chunkSize) });
  }
}

// Campaign 内全局去重：拉所有商户同 campaign 最近 90 天 leads。
async function fetchExistingCampaignLeads(campaignId) {
  const pageSize = 1000;
  const rows = [];
  // 90-day dedup window: businesses collected >90 days ago are released back into the pool.
  const dedupCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase("GET", "laboe_leads", {
      query: `?select=merchant_id,campaign_id,run_date,phone,business_name,google_maps_url,website_or_social_url,address,dedupe_key&campaign_id=eq.${encodeURIComponent(campaignId)}&run_date=gte.${dedupCutoff}&order=id.asc&limit=${pageSize}&offset=${offset}`,
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

// list 编号在 (merchant_id, campaign_id, run_date) 范围内连续
async function getNextListIndex(merchantId, campaignId, runDate) {
  const rows = await supabase("GET", "laboe_send_batches", {
    query: `?select=sender_profile&merchant_id=eq.${encodeURIComponent(merchantId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&run_date=eq.${encodeURIComponent(runDate)}`,
  });
  let maxIndex = 0;
  for (const row of rows || []) {
    const match = String(row.sender_profile || "").match(/^WA(\d+)$/);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]));
  }
  return maxIndex + 1;
}

function prepareRequestImport(parsed, ctx, listIndex, existingDayPhones, existingDayCount) {
  const { merchantId, campaignId, runDate, targetLeads } = ctx;
  const rawLeads = Array.isArray(parsed.newLeads) ? parsed.newLeads : Array.isArray(parsed.leads) ? parsed.leads : [];
  if (!rawLeads.length) throw new Error("Collector returned no leads.");

  const sourceLanes = Array.isArray(parsed.source_lanes) ? parsed.source_lanes : [];
  const profile = `WA${String(listIndex).padStart(2, "0")}`;
  const batchId = `${merchantId}-${campaignId}-${profile}-${runDate}`;

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
      id: `${merchantId}-${campaignId}-${runDate}-${profile}-${String(sequence).padStart(3, "0")}-${phone}`,
      merchant_id: merchantId,
      campaign_id: campaignId,
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
      lead_score: lead.lead_score ?? null,
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
    campaign_id: campaignId,
    run_date: runDate,
    sender_profile: profile,
    title: `List ${listIndex} — ${runDate}`,
    target_count: targetLeads,
    status: "open",
  };

  return {
    collection: {
      merchant_id: merchantId,
      campaign_id: campaignId,
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

async function runCollector(runDate, targetLeads, campaignId) {
  // 测试钩子：设了 COLLECTOR_STUB_JSON 就直接读它，跳过真实抓取（生产不设此 env）
  if (process.env.COLLECTOR_STUB_JSON) {
    const parsed = JSON.parse(await fs.readFile(process.env.COLLECTOR_STUB_JSON, "utf8"));
    parsed.date = parsed.date || runDate;
    return parsed;
  }
  const { stdout, stderr } = await execFileAsync(
    "node",
    ["scripts/laboe_collect_google_maps_leads.mjs", runDate, String(targetLeads), campaignId],
    { maxBuffer: 120 * 1024 * 1024, env: { ...process.env, CAMPAIGN_ID: campaignId } },
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

async function processRequest(request) {
  const merchantId = request.merchant_id;
  const campaignId = request.campaign_id || "design";
  const runDate = request.run_date;
  const searchRequestId = request.search_request_id;
  const targetLeads = await getMerchantTarget(merchantId, request.target_leads);
  const ctx = { merchantId, campaignId, runDate, targetLeads };

  await setSearchStatus(searchRequestId, "processing");
  await upsertRun({
    merchant_id: merchantId,
    campaign_id: campaignId,
    run_date: runDate,
    target_leads: targetLeads,
    mode: "Collection processing in GitHub Actions",
    notes: `Worker started at ${new Date().toISOString()}.`,
  });

  try {
    const existingLeads = await fetchExistingCampaignLeads(campaignId);
    await writeSupabaseHistoryFile(existingLeads);
    // 同日同商户已有的 phone（用于 list 编号续号 + assigned 计数）；全局去重由 history 文件负责
    const existingDayLeads = existingLeads.filter(
      (row) => String(row.merchant_id) === String(merchantId)
        && String(row.campaign_id || "design") === String(campaignId)
        && String(row.run_date) === String(runDate),
    );
    const existingDayPhones = new Set(existingDayLeads.map((row) => String(row.phone || "").replace(/\D/g, "")).filter(Boolean));

    const collectorJson = await runCollector(runDate, targetLeads, campaignId);
    const listIndex = await getNextListIndex(merchantId, campaignId, runDate);
    const prepared = prepareRequestImport(collectorJson, ctx, listIndex, existingDayPhones, existingDayLeads.length);
    await upsertRun(prepared.collection);
    await upsertRows("laboe_send_batches", prepared.batches, "id");
    await upsertRows("laboe_leads", prepared.leads, "id");
    await setSearchStatus(searchRequestId, "completed", { result_count: prepared.leads.length });
    console.log(`Added ${prepared.leads.length} new leads for ${merchantId}/${campaignId}/${runDate} (${prepared.batches[0].title}).`);
  } catch (error) {
    await upsertRun({
      merchant_id: merchantId,
      campaign_id: campaignId,
      run_date: runDate,
      target_leads: targetLeads,
      mode: "Collection failed in GitHub Actions",
      notes: error.message.slice(0, 900),
    });
    await setSearchStatus(searchRequestId, "failed", { notes: error.message.slice(0, 400) });
    throw error;
  }
}

async function main() {
  // B: 先回收被 cancel/崩溃卡死的 processing 孤儿。
  const reclaimed = await reclaimStaleProcessing(supabase, STALE_GRACE_MS, Date.now());
  if (reclaimed > 0) console.log(`Reclaimed ${reclaimed} stale processing request(s) back to requested.`);

  // C: 首个请求(dispatch 显式 或 cron 最旧) → drain 清空积压。单个请求失败不中断整轮 drain。
  const first = await resolveRequest();
  let failures = 0;
  const processed = await drainQueue({
    firstRequest: first,
    pickNext: () => pickOldestRequested(supabase),
    process: async (request) => {
      try {
        await processRequest(request);
      } catch (error) {
        failures += 1;
        console.error(`Request ${request.search_request_id} failed, continuing drain: ${error.message}`);
      }
    },
    now: Date.now,
  });

  if (processed === 0) console.log("No collection request found.");
  else console.log(`Drain complete: processed ${processed} request(s), ${failures} failed.`);
  if (failures > 0) process.exitCode = 1; // 保留 CI 红灯，但不中断已完成的其他请求
}

// 只有作为脚本直接运行才执行 main()；被测试 import 时不自动跑。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}

export { reclaimStaleProcessing, pickOldestRequested, drainQueue };
