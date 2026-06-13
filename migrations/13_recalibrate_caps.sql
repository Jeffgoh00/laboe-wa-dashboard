-- ============================================================
-- Migration 13 —— 套餐额度调整为 500/1200/2500（可重复运行）
-- 之前是 800/1500/3000；按 Stripe 实际定价对齐现有商户。
-- ============================================================
update public.laboe_merchants set monthly_lead_cap = 500  where tier = 'tier1';
update public.laboe_merchants set monthly_lead_cap = 1200 where tier = 'tier2';
update public.laboe_merchants set monthly_lead_cap = 2500 where tier = 'tier3';
