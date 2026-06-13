-- ============================================================
-- Migration 09 —— Plan 模型：默认 none（无 plan）+ 免费试用（可重复运行）
-- 新商户默认 none，无 cap；免费试 1 次后必须订阅。现有 M001/OWNER 不动。
-- ============================================================
alter table public.laboe_merchants alter column tier set default 'none';
alter table public.laboe_merchants alter column monthly_lead_cap drop default;  -- 新商户 cap = NULL
alter table public.laboe_merchants add column if not exists trial_used boolean not null default false;
