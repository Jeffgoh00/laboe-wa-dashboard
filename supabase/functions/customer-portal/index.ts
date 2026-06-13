// customer-portal —— 商户点 "Manage billing"，生成 Stripe Billing Portal session（账单历史/换卡/取消）。
// verify_jwt=true（config.toml）。
import Stripe from "https://esm.sh/stripe@17?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (n: string, d = "") => Deno.env.get(n) || d;
const json = (p: Record<string, unknown>, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

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
    const svc = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };
    const rows = await (await fetch(
      `${supaUrl}/rest/v1/laboe_merchant_users?select=merchant_id,laboe_merchants(stripe_customer_id)&user_id=eq.${userId}`,
      { headers: svc })).json();
    const cust = Array.isArray(rows) ? rows[0]?.laboe_merchants?.stripe_customer_id : null;
    if (!cust) return json({ ok: false, error: "No billing account yet. Subscribe to a plan first.", noCustomer: true }, 200);

    const session = await stripe.billingPortal.sessions.create({ customer: cust, return_url: portalUrl });
    return json({ ok: true, url: session.url });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || String(e) }, 400);
  }
});
