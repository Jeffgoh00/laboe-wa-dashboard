-- ============================================================
-- Migration 10 —— 自助注册：每个新 auth 用户自动建 merchant + 映射（plan=none）
-- merchant_id = 用户 uuid；name = email；tier=none（免费试用 1 次）。
-- 现有用户不受影响（触发器只在 insert 时触发）。
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.laboe_merchants (merchant_id, name, tier)
    values (new.id::text, coalesce(new.email, new.id::text), 'none')
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
