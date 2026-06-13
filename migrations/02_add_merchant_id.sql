-- ============================================================
-- Migration 02 —— 给 4 张老表加 merchant_id（往上加，不动现有数据，可重复运行）
-- 现有行自动 backfill 成 'OWNER'。default 暂留以免线上旧 worker 插入失败；
-- Phase 4 换新 worker（显式写 merchant_id）后再 drop default。
-- ============================================================

-- 1) 加列（not null default 'OWNER' → 现有行自动归 OWNER）
alter table public.laboe_collection_runs    add column if not exists merchant_id text not null default 'OWNER';
alter table public.laboe_send_batches       add column if not exists merchant_id text not null default 'OWNER';
alter table public.laboe_leads              add column if not exists merchant_id text not null default 'OWNER';
alter table public.laboe_lead_status_events add column if not exists merchant_id text not null default 'OWNER';

-- 2) 外键 → laboe_merchants（幂等：先查再加）
do $$ begin
  if not exists (select 1 from pg_constraint where conname='laboe_collection_runs_merchant_fk') then
    alter table public.laboe_collection_runs add constraint laboe_collection_runs_merchant_fk
      foreign key (merchant_id) references public.laboe_merchants(merchant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_send_batches_merchant_fk') then
    alter table public.laboe_send_batches add constraint laboe_send_batches_merchant_fk
      foreign key (merchant_id) references public.laboe_merchants(merchant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_leads_merchant_fk') then
    alter table public.laboe_leads add constraint laboe_leads_merchant_fk
      foreign key (merchant_id) references public.laboe_merchants(merchant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_lead_status_events_merchant_fk') then
    alter table public.laboe_lead_status_events add constraint laboe_lead_status_events_merchant_fk
      foreign key (merchant_id) references public.laboe_merchants(merchant_id);
  end if;
end $$;

-- 3) 索引（按 merchant 取数用）
create index if not exists laboe_leads_merchant_run_idx          on public.laboe_leads(merchant_id, run_date);
create index if not exists laboe_send_batches_merchant_run_idx   on public.laboe_send_batches(merchant_id, run_date);
create index if not exists laboe_collection_runs_merchant_idx    on public.laboe_collection_runs(merchant_id);
create index if not exists laboe_lead_status_events_merchant_idx on public.laboe_lead_status_events(merchant_id);
