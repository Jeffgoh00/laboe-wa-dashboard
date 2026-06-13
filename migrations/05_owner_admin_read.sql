-- ============================================================
-- Migration 05 —— OWNER 登录可看全部（global view 用，浏览器安全，可重复运行）
-- 起因：Supabase 新 secret key 禁止在浏览器使用，所以 owner 全局视图改成
-- "OWNER 登录 + publishable key + RLS 放行"。普通商户不受影响（is_owner=false）。
-- ============================================================

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_merchant_id() = 'OWNER', false); $$;

drop policy if exists m_select on public.laboe_merchants;
create policy m_select on public.laboe_merchants for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists runs_select on public.laboe_collection_runs;
create policy runs_select on public.laboe_collection_runs for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists batches_select on public.laboe_send_batches;
create policy batches_select on public.laboe_send_batches for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists leads_select on public.laboe_leads;
create policy leads_select on public.laboe_leads for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists sr_select on public.laboe_search_requests;
create policy sr_select on public.laboe_search_requests for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists lse_select on public.laboe_lead_status_events;
create policy lse_select on public.laboe_lead_status_events for select to authenticated
  using (merchant_id = public.current_merchant_id() or public.is_owner());
