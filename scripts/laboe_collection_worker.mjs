import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const supabaseUrl = mustEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const targetLeads = Number(process.env.TARGET_LEADS || "100");
const explicitDate = process.env.COLLECTION_DATE || "";
const historyFilePath = path.join("lead_outputs", "supabase-history.json");

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function supabase(method, table, { query = "", body } = {}) {
  const url = `${supabaseUrl}/rest/v1/${table}${query}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${table} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getRequestedRun() {
  if (explicitDate) {
    const rows = await supabase("GET", "laboe_collection_runs", {
      query: `?select=*&run_date=eq.${encodeURIComponent(explicitDate)}&limit=1`,
    });
    return rows?.[0] || { run_date: explicitDate };
  }
  const rows = await supabase("GET", "laboe_collection_runs", {
    query: "?select=*&mode=eq.Collection%20requested%20from%20dashboard&order=updated_at.asc&limit=1",
  });
  return rows?.[0] || null;
}

async function upsertRun(run) {
  await supabase("POST", "laboe_collection_runs?on_conflict=run_date", { body: run });
}

async function upsertRows(table, rows, conflictKey) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await supabase("POST", `${table}?on_conflict=${conflictKey}`, { body: chunk });
  }
}

async function fetchAllExistingLeads() {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase("GET", "laboe_leads", {
      query: `?select=run_date,phone,business_name,google_maps_url,website_or_social_url,address,dedupe_key&order=id.asc&limit=${pageSize}&offset=${offset}`,
    });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

// The collector dedupes against every JSON pack inside lead_outputs/, so the
// full Supabase lead history is written there before the collector starts.
// This is the source of truth for "never contact the same business twice".
async function writeSupabaseHistoryFile(existingLeads) {
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });
  await fs.writeFile(historyFilePath, JSON.stringify({ newLeads: existingLeads }));
}

async function getNextListIndex(runDate) {
  const rows = await supabase("GET", "laboe_send_batches", {
    query: `?select=sender_profile&run_date=eq.${encodeURIComponent(runDate)}`,
  });
  let maxIndex = 0;
  for (const row of rows || []) {
    const match = String(row.sender_profile || "").match(/^WA(\d+)$/);
    if (match) maxIndex = Math.max(maxIndex, Number(match[1]));
  }
  return maxIndex + 1;
}

function prepareRequestImport(parsed, runDate, listIndex, existingDayPhones, existingDayCount) {
  const rawLeads = Array.isArray(parsed.newLeads) ? parsed.newLeads : Array.isArray(parsed.leads) ? parsed.leads : [];
  if (!rawLeads.length) throw new Error("Collector returned no leads.");

  const sourceLanes = Array.isArray(parsed.source_lanes) ? parsed.source_lanes : [];
  const profile = `WA${String(listIndex).padStart(2, "0")}`;
  const batchId = `${profile}-${runDate}`;

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
      id: `${runDate}-${profile}-${String(sequence).padStart(3, "0")}-${phone}`,
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
    run_date: runDate,
    sender_profile: profile,
    title: `List ${listIndex} — ${runDate}`,
    target_count: targetLeads,
    status: "open",
  };

  return {
    collection: {
      run_date: runDate,
      target_leads: targetLeads,
      ready_leads: leads.length,
      assigned_leads: existingDayCount + leads.length,
      source_lanes_attempted: sourceLanes.length,
      active_source_lanes: sourceLanes.filter((lane) => Number(lane.accepted || 0) > 0).length,
      suppressed_candidates: parsed.suppress_count || 0,
      mode: leads.length >= targetLeads ? "Collection completed by GitHub Actions" : "Collection short by GitHub Actions",
      notes: `GitHub Actions added ${leads.length} new leads into ${batch.title}. Total for ${runDate}: ${existingDayCount + leads.length}.`,
    },
    batches: [batch],
    leads,
  };
}

async function runCollector(runDate) {
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
  const request = await getRequestedRun();
  if (!request) {
    console.log("No collection request found.");
    return;
  }

  const runDate = request.run_date;
  await upsertRun({
    run_date: runDate,
    target_leads: targetLeads,
    ready_leads: 0,
    assigned_leads: Number(request.assigned_leads || 0),
    source_lanes_attempted: Number(request.source_lanes_attempted || 0),
    active_source_lanes: Number(request.active_source_lanes || 0),
    suppressed_candidates: Number(request.suppressed_candidates || 0),
    mode: "Collection processing in GitHub Actions",
    notes: `Worker started at ${new Date().toISOString()}.`,
  });

  try {
    const existingLeads = await fetchAllExistingLeads();
    await writeSupabaseHistoryFile(existingLeads);
    const existingDayLeads = existingLeads.filter((row) => String(row.run_date) === String(runDate));
    const existingDayPhones = new Set(existingDayLeads.map((row) => String(row.phone || "").replace(/\D/g, "")).filter(Boolean));

    const collectorJson = await runCollector(runDate);
    const listIndex = await getNextListIndex(runDate);
    const prepared = prepareRequestImport(collectorJson, runDate, listIndex, existingDayPhones, existingDayLeads.length);
    await upsertRun(prepared.collection);
    await upsertRows("laboe_send_batches", prepared.batches, "id");
    await upsertRows("laboe_leads", prepared.leads, "id");
    console.log(`Added ${prepared.leads.length} new leads for ${runDate} (${prepared.batches[0].title}).`);
  } catch (error) {
    await upsertRun({
      run_date: runDate,
      target_leads: targetLeads,
      ready_leads: 0,
      assigned_leads: Number(request.assigned_leads || 0),
      source_lanes_attempted: Number(request.source_lanes_attempted || 0),
      active_source_lanes: Number(request.active_source_lanes || 0),
      suppressed_candidates: Number(request.suppressed_candidates || 0),
      mode: "Collection failed in GitHub Actions",
      notes: error.message.slice(0, 900),
    });
    throw error;
  }
}

await main();
