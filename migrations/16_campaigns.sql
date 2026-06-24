-- ============================================================
-- Migration 16 —— Campaign support (Design + Joymom Mooncake)
-- Existing rows are migrated to campaign_id='design'.
-- Deduplication and daily runs become independent per campaign.
-- ============================================================

create table if not exists public.laboe_campaigns (
  merchant_id  text not null references public.laboe_merchants(merchant_id) on delete cascade,
  campaign_id  text not null,
  name         text not null,
  brand_name   text not null,
  sender_name  text,
  description  text,
  status       text not null default 'active' check (status in ('active', 'archived')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (merchant_id, campaign_id)
);

insert into public.laboe_campaigns
  (merchant_id, campaign_id, name, brand_name, sender_name, description, sort_order)
select merchant_id, 'design', 'Laboe Design Services', 'Laboe Studio', null,
       'Branding, design, website and marketing service leads.', 10
from public.laboe_merchants
on conflict (merchant_id, campaign_id) do nothing;

insert into public.laboe_campaigns
  (merchant_id, campaign_id, name, brand_name, sender_name, description, sort_order)
select merchant_id, 'joymom', 'Joymom Mooncake B2B', 'Joymom Cookies', 'Jeff',
       'Corporate mooncake orders for Malaysian businesses.', 20
from public.laboe_merchants
on conflict (merchant_id, campaign_id) do nothing;

create or replace function public.create_default_campaigns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.laboe_campaigns
    (merchant_id, campaign_id, name, brand_name, sender_name, description, sort_order)
  values
    (new.merchant_id, 'design', 'Laboe Design Services', 'Laboe Studio', null,
     'Branding, design, website and marketing service leads.', 10),
    (new.merchant_id, 'joymom', 'Joymom Mooncake B2B', 'Joymom Cookies', 'Jeff',
     'Corporate mooncake orders for Malaysian businesses.', 20)
  on conflict (merchant_id, campaign_id) do nothing;
  return new;
end;
$$;

drop trigger if exists laboe_merchants_default_campaigns on public.laboe_merchants;
create trigger laboe_merchants_default_campaigns
after insert on public.laboe_merchants
for each row execute function public.create_default_campaigns();

alter table public.laboe_search_requests
  add column if not exists campaign_id text not null default 'design';
alter table public.laboe_collection_runs
  add column if not exists campaign_id text not null default 'design';
alter table public.laboe_send_batches drop constraint if exists laboe_send_batches_campaign_run_fk;
alter table public.laboe_leads drop constraint if exists laboe_leads_campaign_run_fk;
alter table public.laboe_search_requests drop constraint if exists laboe_search_requests_campaign_fk;
alter table public.laboe_collection_runs drop constraint if exists laboe_collection_runs_campaign_fk;
alter table public.laboe_send_batches drop constraint if exists laboe_send_batches_campaign_fk;
alter table public.laboe_leads drop constraint if exists laboe_leads_campaign_fk;
alter table public.laboe_lead_status_events drop constraint if exists laboe_lead_status_events_campaign_fk;
alter table public.laboe_send_batches drop constraint if exists laboe_send_batches_campaign_run_profile_key;
alter table public.laboe_leads drop constraint if exists laboe_leads_campaign_run_phone_key;

alter table public.laboe_send_batches
  add column if not exists campaign_id text not null default 'design';
alter table public.laboe_leads
  add column if not exists campaign_id text not null default 'design';
alter table public.laboe_lead_status_events
  add column if not exists campaign_id text not null default 'design';

-- Remove foreign keys to collection_runs before changing its primary key.
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

-- Replace the run primary key with (merchant, campaign, date).
do $$
declare pk text;
begin
  select conname into pk from pg_constraint
    where contype='p' and conrelid='public.laboe_collection_runs'::regclass;
  if pk is not null then
    execute format('alter table public.laboe_collection_runs drop constraint %I', pk);
  end if;
  alter table public.laboe_collection_runs
    add primary key (merchant_id, campaign_id, run_date);
end $$;

-- Remove old uniqueness rules that did not include campaign_id.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where contype='u' and conrelid='public.laboe_send_batches'::regclass
      and pg_get_constraintdef(oid) ilike '%merchant_id%run_date%sender_profile%'
  loop execute format('alter table public.laboe_send_batches drop constraint %I', r.conname); end loop;

  for r in
    select conname from pg_constraint
    where contype='u' and conrelid='public.laboe_leads'::regclass
      and pg_get_constraintdef(oid) ilike '%merchant_id%run_date%phone%'
  loop execute format('alter table public.laboe_leads drop constraint %I', r.conname); end loop;
end $$;

alter table public.laboe_send_batches
  add constraint laboe_send_batches_campaign_run_fk
  foreign key (merchant_id, campaign_id, run_date)
  references public.laboe_collection_runs(merchant_id, campaign_id, run_date) on delete cascade;

alter table public.laboe_leads
  add constraint laboe_leads_campaign_run_fk
  foreign key (merchant_id, campaign_id, run_date)
  references public.laboe_collection_runs(merchant_id, campaign_id, run_date) on delete cascade;

alter table public.laboe_search_requests
  add constraint laboe_search_requests_campaign_fk
  foreign key (merchant_id, campaign_id)
  references public.laboe_campaigns(merchant_id, campaign_id);
alter table public.laboe_collection_runs
  add constraint laboe_collection_runs_campaign_fk
  foreign key (merchant_id, campaign_id)
  references public.laboe_campaigns(merchant_id, campaign_id);
alter table public.laboe_send_batches
  add constraint laboe_send_batches_campaign_fk
  foreign key (merchant_id, campaign_id)
  references public.laboe_campaigns(merchant_id, campaign_id);
alter table public.laboe_leads
  add constraint laboe_leads_campaign_fk
  foreign key (merchant_id, campaign_id)
  references public.laboe_campaigns(merchant_id, campaign_id);
alter table public.laboe_lead_status_events
  add constraint laboe_lead_status_events_campaign_fk
  foreign key (merchant_id, campaign_id)
  references public.laboe_campaigns(merchant_id, campaign_id);

alter table public.laboe_send_batches
  add constraint laboe_send_batches_campaign_run_profile_key
  unique (merchant_id, campaign_id, run_date, sender_profile);
alter table public.laboe_leads
  add constraint laboe_leads_campaign_run_phone_key
  unique (merchant_id, campaign_id, run_date, phone);

-- Joymom uses a small sales pipeline while Design keeps its current statuses.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where contype='c' and conrelid='public.laboe_leads'::regclass
      and pg_get_constraintdef(oid) ilike '%send_status%'
  loop execute format('alter table public.laboe_leads drop constraint %I', r.conname); end loop;

  for r in
    select conname from pg_constraint
    where contype='c' and conrelid='public.laboe_lead_status_events'::regclass
      and pg_get_constraintdef(oid) ilike '%new_status%'
  loop execute format('alter table public.laboe_lead_status_events drop constraint %I', r.conname); end loop;
end $$;

alter table public.laboe_leads
  add constraint laboe_leads_send_status_check
  check (send_status in (
    'pending', 'sent', 'replied', 'catalogue_sent', 'quoted',
    'ordered', 'not_interested', 'bad', 'skip'
  ));
alter table public.laboe_lead_status_events
  add constraint laboe_lead_status_events_new_status_check
  check (new_status in (
    'pending', 'sent', 'replied', 'catalogue_sent', 'quoted',
    'ordered', 'not_interested', 'bad', 'skip'
  ));

create index if not exists laboe_leads_campaign_run_idx
  on public.laboe_leads(merchant_id, campaign_id, run_date);
create index if not exists laboe_search_requests_campaign_idx
  on public.laboe_search_requests(merchant_id, campaign_id, created_at desc);

drop trigger if exists laboe_campaigns_updated_at on public.laboe_campaigns;
create trigger laboe_campaigns_updated_at before update on public.laboe_campaigns
for each row execute function public.set_updated_at();

alter table public.laboe_campaigns enable row level security;

drop policy if exists campaigns_select on public.laboe_campaigns;
create policy campaigns_select on public.laboe_campaigns for select to authenticated
using (merchant_id = public.current_merchant_id() or public.is_owner());

drop policy if exists campaigns_update on public.laboe_campaigns;
create policy campaigns_update on public.laboe_campaigns for update to authenticated
using (merchant_id = public.current_merchant_id())
with check (merchant_id = public.current_merchant_id());
