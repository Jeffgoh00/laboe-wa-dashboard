-- ============================================================
-- Migration 14 —— Wins Wall（Result tab）：商户战绩社区墙
-- 故意跨租户可读（社区分享）；插入限本人；删除 = OWNER 或作者。
-- 含 Storage bucket 'wins'（公开读）+ storage.objects 策略。
-- 在 Supabase SQL Editor 手动运行（可重复运行）。
-- ============================================================

create table if not exists public.laboe_wins (
  id          uuid primary key default gen_random_uuid(),
  merchant_id text not null references public.laboe_merchants(merchant_id) on delete cascade,
  poster_name text,
  caption     text not null,
  amount      numeric,
  image_urls  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists laboe_wins_created_idx on public.laboe_wins (created_at desc);

alter table public.laboe_wins enable row level security;

-- 所有登录商户可读全部（社区墙，故意跨租户）
drop policy if exists wins_read_all on public.laboe_wins;
create policy wins_read_all on public.laboe_wins
  for select to authenticated using (true);

-- 只能插自己 merchant 的 win
drop policy if exists wins_insert_own on public.laboe_wins;
create policy wins_insert_own on public.laboe_wins
  for insert to authenticated
  with check (merchant_id = public.current_merchant_id());

-- 删除：OWNER 删任意，或作者删自己
drop policy if exists wins_delete_own_or_owner on public.laboe_wins;
create policy wins_delete_own_or_owner on public.laboe_wins
  for delete to authenticated
  using (public.is_owner() or merchant_id = public.current_merchant_id());

-- ---------- Storage bucket 'wins'（公开读） ----------
insert into storage.buckets (id, name, public)
  values ('wins', 'wins', true)
  on conflict (id) do nothing;

-- 公开读
drop policy if exists wins_storage_read on storage.objects;
create policy wins_storage_read on storage.objects
  for select to public using (bucket_id = 'wins');

-- 上传：仅能传进自己 merchant 文件夹（路径首段 = merchant_id）
drop policy if exists wins_storage_insert on storage.objects;
create policy wins_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wins' and (storage.foldername(name))[1] = public.current_merchant_id());

-- 删除：自己文件夹或 OWNER
drop policy if exists wins_storage_delete on storage.objects;
create policy wins_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'wins' and ((storage.foldername(name))[1] = public.current_merchant_id() or public.is_owner()));
