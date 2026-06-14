-- ============================================================
-- Migration 15 —— 90 天名单保留：自动清理 >90 天的【商户】采集 leads
-- ⚠️ 只清 merchant 数据；OWNER(global 母本档案)永久保留。
-- 与 90 天去重窗口对齐（worker 已加 run_date>=今天-90天 过滤，去重与存储互不影响）。
-- 只删 laboe_leads：status_events 走 lead_id FK ON DELETE CASCADE 自动连带删；
-- 小表 send_batches / collection_runs 不动（体量极小，且避免 run_date FK 复杂度）。
-- 在 Supabase SQL Editor 手动运行（可重复运行）。
-- ⚠️ 现在项目数据都 <90 天，运行后删 0 行，是面向未来的策略。
-- ============================================================

-- 1) 清理函数（security definer 绕过 RLS）
create or replace function public.purge_old_leads()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.laboe_leads
  where run_date < current_date - 90
    and merchant_id <> 'OWNER';   -- OWNER 全局母本永久保留
end;
$$;

-- 2) 启用 pg_cron（若失败：Dashboard → Database → Extensions → 搜 pg_cron 启用，再跑第 3 步）
create extension if not exists pg_cron;

-- 3) 每天 18:00 UTC（= 02:00 大马时间，低峰）跑一次；重复运行先反注册旧的
select cron.unschedule('purge-old-leads')
  where exists (select 1 from cron.job where jobname = 'purge-old-leads');

select cron.schedule('purge-old-leads', '0 18 * * *', $$select public.purge_old_leads();$$);

-- 查看任务：     select jobname, schedule, active from cron.job;
-- 手动跑一次(可选,现在删 0 行)： select public.purge_old_leads();
