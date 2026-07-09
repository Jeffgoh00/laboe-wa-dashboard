// Unit tests for the collection-worker queue robustness logic (B + C root fix).
// Run: node --test scripts/laboe_collection_worker.test.mjs
// No framework/deps — uses Node 20 built-in node:test + node:assert.
//
// Covers the two root causes of "florist 拿不到 leads":
//   B) orphaned `processing` requests (run cancelled/crashed after setStatus processing)
//      → reclaimStaleProcessing flips them back to `requested`.
//   C) rapid dispatches whose pending runs GitHub cancels under single-lane concurrency
//      → drainQueue makes ONE surviving run clear the whole backlog (not one-per-run).

import test from "node:test";
import assert from "node:assert/strict";

// Dummy env so importing the worker module doesn't throw on its top-level mustEnv() reads.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://test.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";

const { reclaimStaleProcessing, pickOldestRequested, drainQueue } = await import(
  "./laboe_collection_worker.mjs"
);

// A fake db matching the worker's supabase(method, table, {query, body, prefer}) shape.
function fakeDb(handlers = {}) {
  const calls = [];
  const db = async (method, table, opts = {}) => {
    calls.push({ method, table, query: opts.query || "", body: opts.body });
    const key = `${method} ${table}`;
    if (handlers[key]) return handlers[key](opts, calls.length);
    return null;
  };
  db.calls = calls;
  return db;
}

test("reclaimStaleProcessing: PATCHes processing rows older than the grace cutoff back to requested", async () => {
  const now = Date.UTC(2026, 6, 9, 9, 0, 0); // fixed clock
  const graceMs = 20 * 60 * 1000;
  let seen = null;
  const db = fakeDb({
    "PATCH laboe_search_requests": (opts) => {
      seen = opts;
      return [{ id: "a" }, { id: "b" }]; // two rows reclaimed
    },
  });

  const count = await reclaimStaleProcessing(db, graceMs, now);

  assert.equal(count, 2);
  assert.ok(seen, "PATCH was issued");
  assert.match(seen.query, /status=eq\.processing/, "only targets processing rows");
  const cutoffISO = new Date(now - graceMs).toISOString();
  assert.ok(
    seen.query.includes(`updated_at=lt.${cutoffISO}`),
    `cutoff must be now-grace (${cutoffISO}); got query ${seen.query}`,
  );
  assert.equal(seen.body.status, "requested", "flips back to requested");
});

test("reclaimStaleProcessing: does NOT reclaim when nothing is stale (0 rows)", async () => {
  const db = fakeDb({ "PATCH laboe_search_requests": () => [] });
  const count = await reclaimStaleProcessing(db, 20 * 60 * 1000, Date.now());
  assert.equal(count, 0);
});

test("pickOldestRequested: selects oldest status=requested, returns normalized request", async () => {
  const db = fakeDb({
    "GET laboe_search_requests": (opts) => {
      assert.match(opts.query, /status=eq\.requested/);
      assert.match(opts.query, /order=created_at\.asc/);
      assert.match(opts.query, /limit=1/);
      return [{ id: "r1", merchant_id: "OWNER", campaign_id: "florist", run_date: "2026-07-09", target_leads: 100 }];
    },
  });
  const req = await pickOldestRequested(db);
  assert.deepEqual(req, {
    merchant_id: "OWNER",
    campaign_id: "florist",
    run_date: "2026-07-09",
    search_request_id: "r1",
    target_leads: 100,
  });
});

test("pickOldestRequested: returns null when queue empty", async () => {
  const db = fakeDb({ "GET laboe_search_requests": () => [] });
  assert.equal(await pickOldestRequested(db), null);
});

test("drainQueue: processes the first request then drains all remaining requested", async () => {
  const processed = [];
  const remaining = [{ search_request_id: "r2" }, { search_request_id: "r3" }];
  const n = await drainQueue({
    firstRequest: { search_request_id: "r1" },
    pickNext: async () => remaining.shift() || null,
    process: async (r) => { processed.push(r.search_request_id); },
    now: () => 0,
  });
  assert.equal(n, 3);
  assert.deepEqual(processed, ["r1", "r2", "r3"], "one surviving run clears the whole backlog");
});

test("drainQueue: no work → processes nothing", async () => {
  let called = 0;
  const n = await drainQueue({
    firstRequest: null,
    pickNext: async () => null,
    process: async () => { called++; },
    now: () => 0,
  });
  assert.equal(n, 0);
  assert.equal(called, 0);
});

test("drainQueue: stops at maxDrain cap (timeout backstop), leaves rest for next run", async () => {
  let picks = 0;
  const n = await drainQueue({
    firstRequest: { search_request_id: "r1" },
    pickNext: async () => ({ search_request_id: `r${++picks + 1}` }), // infinite supply
    process: async () => {},
    now: () => 0,
    maxDrain: 3,
  });
  assert.equal(n, 3, "never exceeds maxDrain even with unlimited queue");
});

test("drainQueue: stops when wall-clock budget exceeded", async () => {
  let clock = 0;
  const n = await drainQueue({
    firstRequest: { search_request_id: "r1" },
    pickNext: async () => ({ search_request_id: "rx" }), // infinite supply
    process: async () => { clock += 30 * 60 * 1000; }, // each job burns 30 min
    now: () => clock,
    budgetMs: 45 * 60 * 1000,
    maxDrain: 100,
  });
  // r1 (0→30min), budget not yet exceeded → pick rx (30→60min > 45) → stop. 2 processed.
  assert.equal(n, 2, "stops once elapsed exceeds the 45-min budget");
});
