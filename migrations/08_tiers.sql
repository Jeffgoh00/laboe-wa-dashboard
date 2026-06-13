-- ============================================================
-- Migration 08 —— 商户 tier + 月度额度上限（可重复运行）
-- Tier1=800 / Tier2=1500 / Tier3=3000 leads 每月；OWNER 无限(cap=NULL)。
-- 每次采集 100 条。OWNER 在 Edge Function 里豁免，cap 设 NULL 仅作标记。
-- ============================================================
alter table public.laboe_merchants add column if not exists tier text not null default 'tier1';
alter table public.laboe_merchants add column if not exists monthly_lead_cap integer;  -- NULL = 无限
-- 新商户默认 tier1/800（防止漏设变成无限）；OWNER 下面再单独设 NULL
alter table public.laboe_merchants alter column monthly_lead_cap set default 800;

-- 现有非 OWNER 商户默认 tier1 / 800；OWNER 标记无限
update public.laboe_merchants set monthly_lead_cap = 800
  where monthly_lead_cap is null and merchant_id <> 'OWNER';
update public.laboe_merchants set tier = 'owner', monthly_lead_cap = null
  where merchant_id = 'OWNER';

-- 让 OWNER(global-view 里)能改商户的 tier；普通商户仍不能改 merchants
drop policy if exists m_update_owner on public.laboe_merchants;
create policy m_update_owner on public.laboe_merchants for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
