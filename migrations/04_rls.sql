-- ============================================================
-- Migration 04 —— RLS 多租户隔离（可重复运行）
-- 商户(authenticated)只能读写自己 merchant_id 的行。
-- OWNER / worker 用 secret key = service_role，绕过 RLS 自动看全部，无需策略。
-- ============================================================

-- 1) 解析当前登录用户属于哪个商户（SECURITY DEFINER 以便读映射表）
create or replace function public.current_merchant_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select merchant_id from public.laboe_merchant_users where user_id = auth.uid();
$$;

-- 2) 确保所有表开启 RLS
alter table public.laboe_merchants          enable row level security;
alter table public.laboe_merchant_users     enable row level security;
alter table public.laboe_search_requests    enable row level security;
alter table public.laboe_collection_runs    enable row level security;
alter table public.laboe_send_batches       enable row level security;
alter table public.laboe_leads              enable row level security;
alter table public.laboe_lead_status_events enable row level security;

-- 3) 删掉所有旧策略（包括 setup.sql 的 using(true)），动态清空再重建
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname='public' and tablename like 'laboe_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 4) 新策略（最小权限）
-- merchants：只读自己那一行
create policy m_select on public.laboe_merchants
  for select to authenticated using (merchant_id = public.current_merchant_id());

-- merchant_users：只读自己的映射
create policy mu_select on public.laboe_merchant_users
  for select to authenticated using (user_id = auth.uid());

-- collection_runs：只读自己的
create policy runs_select on public.laboe_collection_runs
  for select to authenticated using (merchant_id = public.current_merchant_id());

-- send_batches：只读自己的
create policy batches_select on public.laboe_send_batches
  for select to authenticated using (merchant_id = public.current_merchant_id());

-- leads：读自己的 + 改自己的（标 send_status 等），不能 insert（worker 用 service_role 写）
create policy leads_select on public.laboe_leads
  for select to authenticated using (merchant_id = public.current_merchant_id());
create policy leads_update on public.laboe_leads
  for update to authenticated
  using (merchant_id = public.current_merchant_id())
  with check (merchant_id = public.current_merchant_id());

-- search_requests：读自己的 + 自己发起请求
create policy sr_select on public.laboe_search_requests
  for select to authenticated using (merchant_id = public.current_merchant_id());
create policy sr_insert on public.laboe_search_requests
  for insert to authenticated with check (merchant_id = public.current_merchant_id());

-- lead_status_events：读自己的 + 自己写状态事件
create policy lse_select on public.laboe_lead_status_events
  for select to authenticated using (merchant_id = public.current_merchant_id());
create policy lse_insert on public.laboe_lead_status_events
  for insert to authenticated with check (merchant_id = public.current_merchant_id());
