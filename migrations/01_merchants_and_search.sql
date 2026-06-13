-- ============================================================
-- Migration 01 —— 多租户基础表（全新表，不碰现有数据，可重复运行）
-- 在 Supabase Dashboard → SQL Editor 粘贴运行
-- ============================================================

-- 复用的 updated_at 触发器函数（防御性重建，幂等）
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) 商户表（OWNER 也是其中一行）
create table if not exists public.laboe_merchants (
  merchant_id   text primary key,
  name          text not null,
  status        text not null default 'active' check (status in ('active','paused','disabled')),
  target_leads  integer not null default 100,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 零号商户 = 你自己（owner 的历史数据将归到这里）
insert into public.laboe_merchants (merchant_id, name, status)
values ('OWNER', 'Laboe (Owner)', 'active')
on conflict (merchant_id) do nothing;

-- 2) 登录用户 → 商户 映射（一个商户可有多个登录账号）
create table if not exists public.laboe_merchant_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  merchant_id  text not null references public.laboe_merchants(merchant_id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index if not exists laboe_merchant_users_merchant_idx
  on public.laboe_merchant_users(merchant_id);

-- 3) 搜索记录表（谁、何时、搜了什么、结果多少）
create table if not exists public.laboe_search_requests (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   text not null references public.laboe_merchants(merchant_id) on delete cascade,
  run_date      date not null,
  target_leads  integer not null default 100,
  status        text not null default 'requested'
                check (status in ('requested','processing','completed','failed')),
  requested_by  uuid references auth.users(id),
  result_count  integer,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists laboe_search_requests_merchant_idx
  on public.laboe_search_requests(merchant_id, created_at desc);

-- 4) updated_at 触发器
drop trigger if exists laboe_merchants_updated_at on public.laboe_merchants;
create trigger laboe_merchants_updated_at before update on public.laboe_merchants
  for each row execute function public.set_updated_at();

drop trigger if exists laboe_search_requests_updated_at on public.laboe_search_requests;
create trigger laboe_search_requests_updated_at before update on public.laboe_search_requests
  for each row execute function public.set_updated_at();

-- 5) 新表立刻开 RLS（无策略 = 仅 secret key 可访问，安全默认）
--    Phase 2 再加商户读取策略。
alter table public.laboe_merchants        enable row level security;
alter table public.laboe_merchant_users   enable row level security;
alter table public.laboe_search_requests  enable row level security;
