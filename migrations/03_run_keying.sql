-- ============================================================
-- Migration 03 —— runs 改成 per (merchant_id, run_date)（可重复运行）
-- 让每个商户每天各有独立 run，互不覆盖。
-- 现有数据全是 OWNER + run_date 唯一，所以改键安全。
-- ============================================================

-- 0) 删掉 setup.sql 当初建的 run_date 全局唯一索引（否则两商户不能同一天 search）
drop index if exists public.laboe_collection_runs_run_date_uidx;

-- A) 删掉 send_batches / leads 上指向 collection_runs 的旧外键（按目录动态找名字）
do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype='f' and confrelid='public.laboe_collection_runs'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- B) collection_runs 主键 run_date → (merchant_id, run_date)
do $$
declare pk text;
begin
  select conname into pk from pg_constraint
    where contype='p' and conrelid='public.laboe_collection_runs'::regclass;
  if pk is not null then
    execute format('alter table public.laboe_collection_runs drop constraint %I', pk);
  end if;
  if not exists (
    select 1 from pg_constraint
    where contype='p' and conrelid='public.laboe_collection_runs'::regclass
  ) then
    alter table public.laboe_collection_runs add primary key (merchant_id, run_date);
  end if;
end $$;

-- C) 旧 unique（run_date,*）动态删除
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where contype='u' and conrelid='public.laboe_send_batches'::regclass
      and pg_get_constraintdef(oid) ilike '%(run_date, sender_profile)%'
  loop execute format('alter table public.laboe_send_batches drop constraint %I', r.conname); end loop;

  for r in
    select conname from pg_constraint
    where contype='u' and conrelid='public.laboe_leads'::regclass
      and pg_get_constraintdef(oid) ilike '%(run_date, phone)%'
  loop execute format('alter table public.laboe_leads drop constraint %I', r.conname); end loop;
end $$;

-- D) 重建复合外键 + 复合 unique（按名字幂等）
do $$ begin
  if not exists (select 1 from pg_constraint where conname='laboe_send_batches_run_fk') then
    alter table public.laboe_send_batches add constraint laboe_send_batches_run_fk
      foreign key (merchant_id, run_date)
      references public.laboe_collection_runs(merchant_id, run_date) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_leads_run_fk') then
    alter table public.laboe_leads add constraint laboe_leads_run_fk
      foreign key (merchant_id, run_date)
      references public.laboe_collection_runs(merchant_id, run_date) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_send_batches_merchant_run_profile_key') then
    alter table public.laboe_send_batches add constraint laboe_send_batches_merchant_run_profile_key
      unique (merchant_id, run_date, sender_profile);
  end if;
  if not exists (select 1 from pg_constraint where conname='laboe_leads_merchant_run_phone_key') then
    alter table public.laboe_leads add constraint laboe_leads_merchant_run_phone_key
      unique (merchant_id, run_date, phone);
  end if;
end $$;
