-- ============================================================
-- Migration 06 —— 去掉 merchant_id 的 default 'OWNER'（硬化，幂等）
-- ⚠️ 部署步骤：等新 worker（显式写 merchant_id）push 上线后再跑。
-- 现在跑会让线上旧 worker 的 insert 失败。所有新代码都显式赋 merchant_id，
-- 去掉 default 后，任何漏赋 merchant_id 的 insert 会直接报错（而非静默归到 OWNER）。
-- ============================================================
alter table public.laboe_collection_runs    alter column merchant_id drop default;
alter table public.laboe_send_batches       alter column merchant_id drop default;
alter table public.laboe_leads              alter column merchant_id drop default;
alter table public.laboe_lead_status_events alter column merchant_id drop default;
