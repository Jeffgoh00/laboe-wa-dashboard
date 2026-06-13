-- ============================================================
-- Migration 11 —— 注册加手机号（可重复运行）
-- 商户加 phone 列；触发器从注册 metadata 读 phone 存进去。
-- ============================================================
alter table public.laboe_merchants add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.laboe_merchants (merchant_id, name, tier, phone)
    values (new.id::text, coalesce(new.email, new.id::text), 'none', new.raw_user_meta_data->>'phone')
    on conflict (merchant_id) do nothing;
  insert into public.laboe_merchant_users (user_id, merchant_id)
    values (new.id, new.id::text)
    on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
