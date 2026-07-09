-- ============================================================
-- Migration 19 —— search_requests: 同商户+campaign+当天最多一条 open 请求
-- ------------------------------------------------------------
-- 根治"快速连点 → 建重复 search_request → 每条都 dispatch → GitHub 单线程
-- concurrency 只留 1 个 pending、把旧 pending run 挤 cancel → 该请求变孤儿卡在
-- requested/processing、leads 拿不到"这一整类问题的【源头】。
--
-- open = status in ('requested','processing')。completed/failed 不占用，
-- 所以当天采集完成后仍可再采一轮（新行），只是不允许同时存在两条未完成的。
--
-- 幂等：使用 unique index if not exists；加前需保证无重复 open 三元组
--   （部署时已核实当前 0 重复）。DB 层强约束，连并发点击也挡得住，
--   配合 start-collection EF 的幂等处理（查到 open 就复用）+ worker 的
--   reclaim/drain 自愈，构成"这个问题不再出现"的三层防线。
-- ============================================================

create unique index if not exists laboe_search_requests_one_open_per_day
  on public.laboe_search_requests (merchant_id, campaign_id, run_date)
  where status in ('requested', 'processing');
