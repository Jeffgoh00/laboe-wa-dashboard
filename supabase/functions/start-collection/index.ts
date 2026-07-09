// start-collection —— 商户点 search 的入口。
// verify_jwt=true（见 config.toml）已确保只有登录用户能到这里。
// 本函数：认出商户 → 确认 active → 解析参数 → 【幂等】同商户+campaign+当天已有 open 请求就复用
//         → （新请求才走）额度/试用 → 建 search_request（DB partial unique 兜底 409）→ dispatch GitHub Actions。
//
// 与 migration 19（partial unique on open status）+ worker 的 reclaim/drain 共同根治
// "连点 → 重复请求 → concurrency 挤掉 pending → 孤儿请求 → 拿不到 leads"整类问题。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 从已验签的 JWT 取 sub（user id）
function userIdFromJwt(authHeader: string): string {
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("Missing Authorization bearer token.");
  const part = jwt.split(".")[1];
  if (!part) throw new Error("Malformed JWT.");
  const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  if (!payload.sub) throw new Error("JWT has no sub.");
  return payload.sub as string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase env not available in function.");
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const writeHeaders = { ...restHeaders, "Content-Type": "application/json" };

    // 1) 认出当前商户
    const userId = userIdFromJwt(request.headers.get("Authorization") || "");
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/laboe_merchant_users?select=merchant_id,laboe_merchants(status,target_leads,monthly_lead_cap,tier,trial_used)&user_id=eq.${userId}`,
      { headers: restHeaders },
    );
    const rows = await lookup.json();
    const link = Array.isArray(rows) ? rows[0] : null;
    if (!link?.merchant_id) return json({ ok: false, error: "Your login is not linked to a merchant." }, 403);
    const merchantId = link.merchant_id as string;
    const merchant = link.laboe_merchants || {};
    if (merchant.status && merchant.status !== "active") {
      return json({ ok: false, error: `Merchant is ${merchant.status}.` }, 403);
    }

    // 2) 参数（count 用商户预设，不让前端选）—— 提前解析，供幂等去重用
    const body = await request.json().catch(() => ({}));
    const collectionDate = String(body.collection_date || "").trim();
    const campaignId = String(body.campaign_id || "design").trim().toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw new Error("collection_date must be YYYY-MM-DD.");
    if (!["design", "florist"].includes(campaignId)) throw new Error("Unknown campaign_id.");
    const targetLeads = String(merchant.target_leads || 100);

    const campaignLookup = await fetch(
      `${supabaseUrl}/rest/v1/laboe_campaigns?select=campaign_id,status&merchant_id=eq.${encodeURIComponent(merchantId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&limit=1`,
      { headers: restHeaders },
    );
    const campaigns = await campaignLookup.json();
    if (!Array.isArray(campaigns) || !campaigns[0] || campaigns[0].status !== "active") {
      throw new Error("Campaign is not available.");
    }

    // dispatch helper（复用于新建 + 复用 requested 时的 nudge）
    async function dispatchWorker(searchRequestId: string) {
      const owner = env("GITHUB_OWNER", "LaboeStudio");
      const repo = env("GITHUB_REPO", "wa-leads");
      const workflowId = env("GITHUB_WORKFLOW_ID", "laboe-collection-worker.yml");
      const ref = env("GITHUB_REF", "main");
      const githubToken = env("GITHUB_TOKEN") || env("GITHUB_PAT");
      if (!githubToken) throw new Error("Missing GITHUB_TOKEN function secret.");
      return await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${githubToken}`,
            "Content-Type": "application/json",
            "User-Agent": "laboe-wa-dashboard",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            ref,
            inputs: {
              collection_date: collectionDate,
              target_leads: targetLeads,
              merchant_id: merchantId,
              campaign_id: campaignId,
              search_request_id: String(searchRequestId || ""),
            },
          }),
        },
      );
    }

    // 3) 幂等：同商户+campaign+当天已有 open（requested/processing）请求就复用，绝不建重复行。
    //    这掐断"连点 → 多条请求 → 多次 dispatch → concurrency 挤掉 pending → 孤儿"的源头。
    const openLookup = await fetch(
      `${supabaseUrl}/rest/v1/laboe_search_requests?select=id,status&merchant_id=eq.${encodeURIComponent(merchantId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&run_date=eq.${encodeURIComponent(collectionDate)}&status=in.(requested,processing)&order=created_at.desc&limit=1`,
      { headers: restHeaders },
    );
    const openRows = await openLookup.json();
    const openReq = Array.isArray(openRows) ? openRows[0] : null;
    if (openReq?.id) {
      if (openReq.status === "processing") {
        // 已在采集中：不重复 dispatch（worker drain 会跑完），直接告诉商户进行中。
        return json({
          ok: true, reused: true, status: "processing",
          merchant_id: merchantId, campaign_id: campaignId, collection_date: collectionDate,
          search_request_id: openReq.id,
          message: "Collection already in progress for today — new leads will appear automatically.",
        }, 202);
      }
      // requested 但可能它的 dispatch run 被 concurrency 挤掉了 → 重新 nudge，但不建新行。
      await dispatchWorker(openReq.id).catch(() => {});
      return json({
        ok: true, reused: true, status: "requested",
        merchant_id: merchantId, campaign_id: campaignId, collection_date: collectionDate,
        search_request_id: openReq.id,
        message: "Collection already queued for today — re-nudged the worker.",
      }, 202);
    }

    // 4) 额度 / 免费试用逻辑（只对【新】请求生效）
    const tier = merchant.tier;
    const cap = merchant.monthly_lead_cap;
    if (merchantId === "OWNER" || tier === "unlimited") {
      // 无限，放行
    } else if (tier === "none") {
      // 无 plan：只能免费试 1 次
      if (merchant.trial_used) {
        return json({ ok: false, error: "Free trial used. Please subscribe to a plan to keep collecting." }, 403);
      }
      // 先标记试用已用，防并发双刷
      await fetch(`${supabaseUrl}/rest/v1/laboe_merchants?merchant_id=eq.${encodeURIComponent(merchantId)}`, {
        method: "PATCH",
        headers: writeHeaders,
        body: JSON.stringify({ trial_used: true }),
      });
    } else if (cap != null) {
      // 付费 tier：月度 cap
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const usedRes = await fetch(
        `${supabaseUrl}/rest/v1/laboe_leads?select=id&merchant_id=eq.${merchantId}&created_at=gte.${monthStart}`,
        { headers: { ...restHeaders, Prefer: "count=exact" } },
      );
      const used = Number((usedRes.headers.get("content-range") || "*/0").split("/")[1] || 0);
      if (used >= cap) {
        return json({ ok: false, error: `Monthly cap reached (${used}/${cap} leads). Upgrade your tier for more.` }, 403);
      }
    }

    // 5) 建 search_request（权威记录，merchant_id 来自 JWT，不信前端）。
    //    DB partial unique（migration 19）会挡住并发双插 → 409 时回落复用已存在的 open 请求。
    let searchRequestId: string | undefined;
    const srRes = await fetch(`${supabaseUrl}/rest/v1/laboe_search_requests`, {
      method: "POST",
      headers: { ...writeHeaders, Prefer: "return=representation" },
      body: JSON.stringify({
        merchant_id: merchantId,
        campaign_id: campaignId,
        run_date: collectionDate,
        target_leads: Number(targetLeads),
        status: "requested",
        requested_by: userId,
      }),
    });
    if (srRes.status === 409) {
      // 并发竞态：另一个请求刚建了 open 行。取回它复用，不当失败。
      const raceLookup = await fetch(
        `${supabaseUrl}/rest/v1/laboe_search_requests?select=id&merchant_id=eq.${encodeURIComponent(merchantId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&run_date=eq.${encodeURIComponent(collectionDate)}&status=in.(requested,processing)&order=created_at.desc&limit=1`,
        { headers: restHeaders },
      );
      const raceRows = await raceLookup.json();
      searchRequestId = Array.isArray(raceRows) ? raceRows[0]?.id : undefined;
      if (searchRequestId) await dispatchWorker(searchRequestId).catch(() => {});
      return json({
        ok: true, reused: true, status: "requested",
        merchant_id: merchantId, campaign_id: campaignId, collection_date: collectionDate,
        search_request_id: searchRequestId,
        message: "Collection already queued for today.",
      }, 202);
    }
    if (!srRes.ok) throw new Error(`Failed to create search_request (${srRes.status}): ${await srRes.text()}`);
    searchRequestId = (await srRes.json())?.[0]?.id;

    // 6) dispatch GitHub Actions，把 merchant_id 传进去
    const dispatch = await dispatchWorker(String(searchRequestId || ""));
    if (!dispatch.ok) {
      const text = await dispatch.text();
      // 标记请求失败，方便商户看到
      if (searchRequestId) {
        await fetch(`${supabaseUrl}/rest/v1/laboe_search_requests?id=eq.${searchRequestId}`, {
          method: "PATCH",
          headers: writeHeaders,
          body: JSON.stringify({ status: "failed", notes: `dispatch ${dispatch.status}` }),
        });
      }
      throw new Error(`GitHub workflow dispatch failed (${dispatch.status}): ${text}`);
    }

    return json({
      ok: true,
      merchant_id: merchantId,
      campaign_id: campaignId,
      collection_date: collectionDate,
      target_leads: Number(targetLeads),
      search_request_id: searchRequestId,
    }, 202);
  } catch (error) {
    return json({ ok: false, error: (error as Error).message || String(error) }, 400);
  }
});
