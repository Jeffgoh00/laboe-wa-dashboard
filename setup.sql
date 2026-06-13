-- Laboe WhatsApp Lead Dashboard Supabase setup
-- Run this once in Supabase Dashboard > SQL Editor > New query.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.laboe_collection_runs (
  run_date date primary key,
  target_leads integer not null default 100,
  ready_leads integer not null default 0,
  assigned_leads integer not null default 0,
  source_lanes_attempted integer not null default 0,
  active_source_lanes integer not null default 0,
  suppressed_candidates integer not null default 0,
  mode text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laboe_send_batches (
  id text primary key,
  run_date date not null references public.laboe_collection_runs(run_date) on delete cascade,
  sender_profile text not null,
  title text not null,
  target_count integer not null default 50,
  status text not null default 'open' check (status in ('open', 'complete', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_date, sender_profile)
);

create table if not exists public.laboe_leads (
  id text primary key,
  run_date date not null references public.laboe_collection_runs(run_date) on delete cascade,
  batch_id text not null references public.laboe_send_batches(id) on delete cascade,
  sender_profile text not null,
  sender_sequence integer not null,
  priority_rank integer,
  business_name text not null,
  industry text,
  source_platform text,
  source_lane text,
  google_maps_url text,
  website_or_social_url text,
  address text,
  city text,
  country text,
  phone text not null,
  contact_channel text,
  contact_details text,
  whatsapp_click_to_send_link text,
  active_or_public_evidence text,
  observed_design_need text,
  recommended_angle text,
  suggested_opening_message text,
  lead_grade text,
  next_action text,
  dedupe_key text,
  maps_category text,
  rating numeric,
  reviews integer,
  send_status text not null default 'pending' check (send_status in ('pending', 'sent', 'replied', 'bad', 'skip')),
  send_notes text,
  status_updated_at timestamptz,
  status_updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_date, phone),
  unique (batch_id, sender_sequence)
);

create table if not exists public.laboe_lead_status_events (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.laboe_leads(id) on delete cascade,
  run_date date not null,
  batch_id text not null,
  sender_profile text not null,
  old_status text,
  new_status text not null check (new_status in ('pending', 'sent', 'replied', 'bad', 'skip')),
  notes text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Compatibility patch:
-- If you created an earlier version of these tables, "create table if not exists"
-- will not modify the old columns. These ALTER statements safely add the
-- missing fields this dashboard needs.
alter table if exists public.laboe_collection_runs add column if not exists target_leads integer not null default 100;
alter table if exists public.laboe_collection_runs alter column target_leads set default 100;
alter table if exists public.laboe_collection_runs add column if not exists ready_leads integer not null default 0;
alter table if exists public.laboe_collection_runs add column if not exists assigned_leads integer not null default 0;
alter table if exists public.laboe_collection_runs add column if not exists source_lanes_attempted integer not null default 0;
alter table if exists public.laboe_collection_runs add column if not exists active_source_lanes integer not null default 0;
alter table if exists public.laboe_collection_runs add column if not exists suppressed_candidates integer not null default 0;
alter table if exists public.laboe_collection_runs add column if not exists mode text;
alter table if exists public.laboe_collection_runs add column if not exists notes text;
alter table if exists public.laboe_collection_runs add column if not exists created_at timestamptz not null default now();
alter table if exists public.laboe_collection_runs add column if not exists updated_at timestamptz not null default now();

alter table if exists public.laboe_send_batches add column if not exists run_date date;
alter table if exists public.laboe_send_batches add column if not exists sender_profile text;
alter table if exists public.laboe_send_batches add column if not exists title text;
alter table if exists public.laboe_send_batches add column if not exists target_count integer not null default 50;
alter table if exists public.laboe_send_batches add column if not exists status text not null default 'open';
alter table if exists public.laboe_send_batches add column if not exists created_at timestamptz not null default now();
alter table if exists public.laboe_send_batches add column if not exists updated_at timestamptz not null default now();

alter table if exists public.laboe_leads add column if not exists run_date date;
alter table if exists public.laboe_leads add column if not exists batch_id text;
alter table if exists public.laboe_leads add column if not exists sender_profile text;
alter table if exists public.laboe_leads add column if not exists sender_sequence integer;
alter table if exists public.laboe_leads add column if not exists priority_rank integer;
alter table if exists public.laboe_leads add column if not exists business_name text;
alter table if exists public.laboe_leads add column if not exists industry text;
alter table if exists public.laboe_leads add column if not exists source_platform text;
alter table if exists public.laboe_leads add column if not exists source_lane text;
alter table if exists public.laboe_leads add column if not exists google_maps_url text;
alter table if exists public.laboe_leads add column if not exists website_or_social_url text;
alter table if exists public.laboe_leads add column if not exists address text;
alter table if exists public.laboe_leads add column if not exists city text;
alter table if exists public.laboe_leads add column if not exists country text;
alter table if exists public.laboe_leads add column if not exists phone text;
alter table if exists public.laboe_leads add column if not exists contact_channel text;
alter table if exists public.laboe_leads add column if not exists contact_details text;
alter table if exists public.laboe_leads add column if not exists whatsapp_click_to_send_link text;
alter table if exists public.laboe_leads add column if not exists active_or_public_evidence text;
alter table if exists public.laboe_leads add column if not exists observed_design_need text;
alter table if exists public.laboe_leads add column if not exists recommended_angle text;
alter table if exists public.laboe_leads add column if not exists suggested_opening_message text;
alter table if exists public.laboe_leads add column if not exists lead_grade text;
alter table if exists public.laboe_leads add column if not exists next_action text;
alter table if exists public.laboe_leads add column if not exists dedupe_key text;
alter table if exists public.laboe_leads add column if not exists maps_category text;
alter table if exists public.laboe_leads add column if not exists rating numeric;
alter table if exists public.laboe_leads add column if not exists reviews integer;
alter table if exists public.laboe_leads add column if not exists send_status text not null default 'pending';
alter table if exists public.laboe_leads add column if not exists send_notes text;
alter table if exists public.laboe_leads add column if not exists status_updated_at timestamptz;
alter table if exists public.laboe_leads add column if not exists status_updated_by uuid references auth.users(id);
alter table if exists public.laboe_leads add column if not exists created_at timestamptz not null default now();
alter table if exists public.laboe_leads add column if not exists updated_at timestamptz not null default now();

alter table if exists public.laboe_lead_status_events add column if not exists lead_id text;
alter table if exists public.laboe_lead_status_events add column if not exists run_date date;
alter table if exists public.laboe_lead_status_events add column if not exists batch_id text;
alter table if exists public.laboe_lead_status_events add column if not exists sender_profile text;
alter table if exists public.laboe_lead_status_events add column if not exists old_status text;
alter table if exists public.laboe_lead_status_events add column if not exists new_status text;
alter table if exists public.laboe_lead_status_events add column if not exists notes text;
alter table if exists public.laboe_lead_status_events add column if not exists actor_id uuid references auth.users(id);
alter table if exists public.laboe_lead_status_events add column if not exists created_at timestamptz not null default now();

drop trigger if exists laboe_collection_runs_updated_at on public.laboe_collection_runs;
create trigger laboe_collection_runs_updated_at
before update on public.laboe_collection_runs
for each row execute function public.set_updated_at();

drop trigger if exists laboe_send_batches_updated_at on public.laboe_send_batches;
create trigger laboe_send_batches_updated_at
before update on public.laboe_send_batches
for each row execute function public.set_updated_at();

drop trigger if exists laboe_leads_updated_at on public.laboe_leads;
create trigger laboe_leads_updated_at
before update on public.laboe_leads
for each row execute function public.set_updated_at();

alter table public.laboe_collection_runs enable row level security;
alter table public.laboe_send_batches enable row level security;
alter table public.laboe_leads enable row level security;
alter table public.laboe_lead_status_events enable row level security;

drop policy if exists "Authenticated can read collection runs" on public.laboe_collection_runs;
create policy "Authenticated can read collection runs"
on public.laboe_collection_runs for select
to authenticated
using (true);

drop policy if exists "Authenticated can write collection runs" on public.laboe_collection_runs;
create policy "Authenticated can write collection runs"
on public.laboe_collection_runs for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update collection runs" on public.laboe_collection_runs;
create policy "Authenticated can update collection runs"
on public.laboe_collection_runs for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read send batches" on public.laboe_send_batches;
create policy "Authenticated can read send batches"
on public.laboe_send_batches for select
to authenticated
using (true);

drop policy if exists "Authenticated can write send batches" on public.laboe_send_batches;
create policy "Authenticated can write send batches"
on public.laboe_send_batches for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update send batches" on public.laboe_send_batches;
create policy "Authenticated can update send batches"
on public.laboe_send_batches for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read leads" on public.laboe_leads;
create policy "Authenticated can read leads"
on public.laboe_leads for select
to authenticated
using (true);

drop policy if exists "Authenticated can write leads" on public.laboe_leads;
create policy "Authenticated can write leads"
on public.laboe_leads for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update leads" on public.laboe_leads;
create policy "Authenticated can update leads"
on public.laboe_leads for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can read lead status events" on public.laboe_lead_status_events;
create policy "Authenticated can read lead status events"
on public.laboe_lead_status_events for select
to authenticated
using (true);

drop policy if exists "Authenticated can write lead status events" on public.laboe_lead_status_events;
create policy "Authenticated can write lead status events"
on public.laboe_lead_status_events for insert
to authenticated
with check (true);

create unique index if not exists laboe_collection_runs_run_date_uidx on public.laboe_collection_runs(run_date);
create unique index if not exists laboe_send_batches_id_uidx on public.laboe_send_batches(id);
create unique index if not exists laboe_leads_id_uidx on public.laboe_leads(id);
create index if not exists laboe_leads_run_date_sender_profile_idx on public.laboe_leads(run_date, sender_profile);
create index if not exists laboe_leads_phone_idx on public.laboe_leads(phone);
create index if not exists laboe_leads_send_status_idx on public.laboe_leads(send_status);
create index if not exists laboe_lead_status_events_lead_id_idx on public.laboe_lead_status_events(lead_id);
