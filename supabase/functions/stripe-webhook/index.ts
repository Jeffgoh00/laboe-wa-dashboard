// stripe-webhook —— 接收 Stripe 订阅事件，验签后把 tier/状态同步进 Supabase。
// config.toml 必须 verify_jwt=false（Stripe 调用没有用户 JWT；用签名验证）。
// Deno 关键坑：必须 constructEventAsync + raw body + SubtleCryptoProvider。
import Stripe from "https://esm.sh/stripe@17?target=deno";

const env = (n: string, d = "") => Deno.env.get(n) || d;
const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const TIER_CAP: Record<string, number | null> = { tier1: 800, tier2: 1500, tier3: 3000 };
function tierForPrice(priceId: string): string {
  if (priceId === env("STRIPE_PRICE_BASIC")) return "tier1";
  if (priceId === env("STRIPE_PRICE_PRO")) return "tier2";
  if (priceId === env("STRIPE_PRICE_MAX")) return "tier3";
  return "";
}

const supaUrl = env("SUPABASE_URL").replace(/\/$/, "");
const svc = { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" };

async function patchMerchant(where: string, fields: Record<string, unknown>) {
  await fetch(`${supaUrl}/rest/v1/laboe_merchants?${where}`, { method: "PATCH", headers: svc, body: JSON.stringify(fields) });
}

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = String(sub.customer);
  const priceId = sub.items?.data?.[0]?.price?.id || "";
  const tier = tierForPrice(priceId);
  const active = sub.status === "active" || sub.status === "trialing";
  const fields: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  };
  if (active && tier) { fields.tier = tier; fields.monthly_lead_cap = TIER_CAP[tier] ?? null; }
  // 过期/取消/欠费 → 降到 none（挡采集）
  if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") {
    fields.tier = "none"; fields.monthly_lead_cap = null;
  }
  await patchMerchant(`stripe_customer_id=eq.${encodeURIComponent(customerId)}`, fields);
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider);
  } catch (e) {
    return new Response(`Webhook signature failed: ${(e as Error).message}`, { status: 400 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const merchantId = s.metadata?.merchant_id;
        if (merchantId && s.customer) {
          await patchMerchant(`merchant_id=eq.${encodeURIComponent(merchantId)}`, { stripe_customer_id: String(s.customer) });
        }
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(s.subscription));
          await applySubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
  }
});
