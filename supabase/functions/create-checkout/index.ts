// create-checkout —— 商户点升级，生成 Stripe Checkout 订阅付款页，返回 URL。
// verify_jwt=true（config.toml）确保只有登录商户能调。
import Stripe from "https://esm.sh/stripe@17?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (n: string, d = "") => Deno.env.get(n) || d;
const json = (p: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// tier → Stripe Price ID（你在 Stripe 建好后填进函数 secrets）
function priceForTier(tier: string): string {
  if (tier === "tier1") return env("STRIPE_PRICE_BASIC");
  if (tier === "tier2") return env("STRIPE_PRICE_PRO");
  if (tier === "tier3") return env("STRIPE_PRICE_MAX");
  return "";
}

function userIdFromJwt(auth: string): string {
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return payload.sub as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supaUrl = env("SUPABASE_URL").replace(/\/$/, "");
    const svcKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
    const portalUrl = env("PORTAL_URL", "https://laboestudio.github.io/wa-leads/");

    const userId = userIdFromJwt(req.headers.get("Authorization") || "");
    const body = await req.json().catch(() => ({}));
    const tier = String(body.tier || "");
    const price = priceForTier(tier);
    if (!price) return json({ error: "Unknown or unconfigured plan." }, 400);

    // 找商户
    const svc = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };
    const rows = await (await fetch(
      `${supaUrl}/rest/v1/laboe_merchant_users?select=merchant_id,laboe_merchants(name,stripe_customer_id,subscription_status)&user_id=eq.${userId}`,
      { headers: svc })).json();
    const link = Array.isArray(rows) ? rows[0] : null;
    if (!link?.merchant_id) return json({ error: "Your login is not linked to a merchant." }, 403);
    const merchantId = link.merchant_id as string;
    const merchant = link.laboe_merchants || {};

    // 已有活跃订阅 → 不开第二个订阅；让前端跳 Customer Portal 换套餐（proration 正确切换）
    if (["active", "trialing", "past_due"].includes(merchant.subscription_status)) {
      return json({ ok: false, error: "You already have an active subscription. Use Manage billing to change your plan.", manage: true }, 400);
    }

    // 复用或新建 Stripe customer，并把 id 存回商户（webhook 靠它认人）
    let customerId = merchant.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: merchant.name || merchantId, metadata: { merchant_id: merchantId } });
      customerId = customer.id;
      await fetch(`${supaUrl}/rest/v1/laboe_merchants?merchant_id=eq.${encodeURIComponent(merchantId)}`, {
        method: "PATCH", headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      });
    }

    const sessionObj = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: portalUrl + "?checkout=success",
      cancel_url: portalUrl + "?checkout=cancel",
      metadata: { merchant_id: merchantId, tier },
      subscription_data: { metadata: { merchant_id: merchantId, tier } },
    });
    return json({ ok: true, url: sessionObj.url });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || String(e) }, 400);
  }
});
