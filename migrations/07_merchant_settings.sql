-- ============================================================
-- Migration 07 —— 商户发信身份设置（名字/公司），商户可自填（可重复运行）
-- portal 在发信息页让商户填 sender_name / company_name，开场白占位符替换用。
-- ============================================================
create table if not exists public.laboe_merchant_settings (
  merchant_id  text primary key references public.laboe_merchants(merchant_id) on delete cascade,
  sender_name  text,
  company_name text,
  updated_at   timestamptz not null default now()
);

alter table public.laboe_merchant_settings enable row level security;

drop policy if exists ms_select on public.laboe_merchant_settings;
create policy ms_select on public.laboe_merchant_settings for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists ms_insert on public.laboe_merchant_settings;
create policy ms_insert on public.laboe_merchant_settings for insert to authenticated
  with check (merchant_id = public.current_merchant_id());

drop policy if exists ms_update on public.laboe_merchant_settings;
create policy ms_update on public.laboe_merchant_settings for update to authenticated
  using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

drop trigger if exists laboe_merchant_settings_updated_at on public.laboe_merchant_settings;
create trigger laboe_merchant_settings_updated_at before update on public.laboe_merchant_settings
  for each row execute function public.set_updated_at();
