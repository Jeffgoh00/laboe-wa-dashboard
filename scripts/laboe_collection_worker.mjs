import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const supabaseUrl = mustEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const targetLeads = Number(process.env.TARGET_LEADS || "500");
const explicitDate = process.env.COLLECTION_DATE || "";

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

function prepareDailyImport(parsed) {
  const rawLeads = Array.isArray(parsed.newLeads) ? parsed.newLeads : Array.isArray(parsed.leads) ? parsed.leads : [];
  if (!rawLeads.length) throw new Error("Collector returned no leads.");

  const runDate = parsed.date || rawLeads[0].date || new Date().toISOString().slice(0, 10);
  const sourceLanes = Array.isArray(parsed.source_lanes) ? parsed.source_lanes : [];
  const batchesById = new Map();

  const leads = rawLeads.slice(0, targetLeads).map((lead, index) => {
    const batchIndex = Math.floor(index / 50) + 1;
    const sequence = (index % 50) + 1;
    const profile = `WA${String(batchIndex).padStart(2, "0")}`;
    const batchId = `${profile}-${runDate}`;
    if (!batchesById.has(batchId)) {
      batchesById.set(batchId, {
        id: batchId,
        run_date: runDate,
        sender_profile: profile,
        title: `${profile}-${runDate} Send Dashboard`,
        target_count: 50,
        status: "open",
      });
    }
    const phone = String(lead.phone || "").replace(/\D/g, "");
    return {
      id: `${runDate}-${profile}-${String(sequence).padStart(2, "0")}-${phone}`,
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
