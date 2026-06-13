// start-collection —— 商户点 search 的入口。
// verify_jwt=true（见 config.toml）已确保只有登录用户能到这里。
// 本函数：认出商户 → 确认 active → 建 search_request → 把 merchant_id 传进 GitHub Actions。
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

    // 1) 认出当前商户
    const userId = userIdFromJwt(request.headers.get("Authorization") || "");
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/laboe_merchant_users?select=merchant_id,laboe_merchants(status,target_leads)&user_id=eq.${userId}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const rows = await lookup.json();
    const link = Array.isArray(rows) ? rows[0] : null;
    if (!link?.merchant_id) return json({ ok: false, error: "Your login is not linked to a merchant." }, 403);
    const merchantId = link.merchant_id as string;
    const merchant = link.laboe_merchants || {};
    if (merchant.status && merchant.status !== "active") {
      return json({ ok: false, error: `Merchant is ${merchant.status}.` }, 403);
    }

    // 2) 参数（count 用商户预设，不让前端选）
    const body = await request.json().catch(() => ({}));
    const collectionDate = String(body.collection_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) throw new Error("collection_date must be YYYY-MM-DD.");
    const targetLeads = String(merchant.target_leads || 100);

    // 3) 建 search_request（权威记录，merchant_id 来自 JWT，不信前端）
    const srRes = await fetch(`${supabaseUrl}/rest/v1/laboe_search_requests`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        merchant_id: merchantId,
        run_date: collectionDate,
        target_leads: Number(targetLeads),
        status: "requested",
        requested_by: userId,
      }),
    });
    if (!srRes.ok) throw new Error(`Failed to create search_request (${srRes.status}): ${await srRes.text()}`);
    const searchRequestId = (await srRes.json())?.[0]?.id;

    // 4) dispatch GitHub Actions，把 merchant_id 传进去
    const owner = env("GITHUB_OWNER", "LaboeStudio");
    const repo = env("GITHUB_REPO", "wa-leads");
    const workflowId = env("GITHUB_WORKFLOW_ID", "laboe-collection-worker.yml");
    const ref = env("GITHUB_REF", "main");
    const githubToken = env("GITHUB_TOKEN") || env("GITHUB_PAT");
    if (!githubToken) throw new Error("Missing GITHUB_TOKEN function secret.");

    const dispatch = await fetch(
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
            search_request_id: String(searchRequestId || ""),
          },
        }),
      },
    );
    if (!dispatch.ok) {
      const text = await dispatch.text();
      // 标记请求失败，方便商户看到
      if (searchRequestId) {
        await fetch(`${supabaseUrl}/rest/v1/laboe_search_requests?id=eq.${searchRequestId}`, {
          method: "PATCH",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "failed", notes: `dispatch ${dispatch.status}` }),
        });
      }
      throw new Error(`GitHub workflow dispatch failed (${dispatch.status}): ${text}`);
    }

    return json({
      ok: true,
      merchant_id: merchantId,
      collection_date: collectionDate,
      target_leads: Number(targetLeads),
      search_request_id: searchRequestId,
    }, 202);
  } catch (error) {
    return json({ ok: false, error: (error as Error).message || String(error) }, 400);
  }
});
