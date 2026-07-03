-- ============================================================
-- Migration 17 —— Florist campaign（替代 Joymom）
-- 1) 所有现有商户补 florist campaign 行（sender 继承各自 design 行）
-- 2) joymom 行归档（不删：历史 leads/batches/runs 有 FK 指向它）
-- 3) 注册触发器改为 design + florist（新商户不再送 joymom）
-- 数据部分幂等；已由 REST 先行执行过也可安全重跑。
-- ============================================================

insert into public.laboe_campaigns
  (merchant_id, campaign_id, name, brand_name, sender_name, description, sort_order)
select m.merchant_id, 'florist', 'Laboe Florist Leads',
       coalesce(d.brand_name, 'Laboe Studio'),
       d.sender_name,
       'Design, website and content leads from florists across Malaysia.', 20
from public.laboe_merchants m
left join public.laboe_campaigns d
  on d.merchant_id = m.merchant_id and d.campaign_id = 'design'
on conflict (merchant_id, campaign_id) do nothing;

update public.laboe_campaigns
set status = 'archived'
where campaign_id = 'joymom' and status <> 'archived';

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
    (new.merchant_id, 'florist', 'Laboe Florist Leads', 'Laboe Studio', null,
     'Design, website and content leads from florists across Malaysia.', 20)
  on conflict (merchant_id, campaign_id) do nothing;
  return new;
end;
$$;
