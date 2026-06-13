-- ============================================================
-- Migration 12 —— Stripe 订阅字段（Phase C，可重复运行）
-- webhook 把 Stripe 订阅状态同步进这些字段；tier 仍由 webhook 设。
-- ============================================================
alter table public.laboe_merchants add column if not exists stripe_customer_id text;
alter table public.laboe_merchants add column if not exists stripe_subscription_id text;
alter table public.laboe_merchants add column if not exists subscription_status text;     -- active / past_due / canceled / unpaid ...
alter table public.laboe_merchants add column if not exists current_period_end timestamptz;

create index if not exists laboe_merchants_stripe_customer_idx on public.laboe_merchants(stripe_customer_id);
