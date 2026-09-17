-- ============================================================
-- 013: Connector Runs (observability + cost tracking)
-- ============================================================

create table connector_runs (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references projects(id) on delete cascade,
  company_id                uuid not null references companies(id) on delete cascade,
  data_source_id            uuid not null references data_sources(id),
  source_subscription_id    uuid references source_subscriptions(id) on delete set null,

  -- Timing
  started_at                timestamptz not null default now(),
  finished_at               timestamptz,
  duration_ms               int,

  -- Result
  status                    text check (status in ('success','partial','failed','skipped')),

  -- Stats
  records_fetched           int default 0,
  records_changed           int default 0,
  signals_created           int default 0,

  -- Cost tracking (critical for budget-aware architecture)
  estimated_cost_eur        numeric default 0,
  llm_tokens_used           int default 0,
  llm_cost_eur              numeric default 0,

  -- Debug
  error_message             text,
  error_code                text,   -- 'fetch_failed' | 'parse_failed' | 'rate_limited' | 'requires_js'
  retry_count               int default 0,

  -- Metadata (connector-specific details)
  meta                      jsonb default '{}',
  -- e.g. {"ats_type": "lever", "jobs_new": 5, "jobs_removed": 2,
  --        "career_page_url": "...", "http_status": 200}

  created_at                timestamptz not null default now()
);

create index idx_connector_runs_subscription
  on connector_runs(source_subscription_id, started_at desc)
  where source_subscription_id is not null;

create index idx_connector_runs_source_health
  on connector_runs(data_source_id, status, started_at desc);

create index idx_connector_runs_company_recent
  on connector_runs(company_id, started_at desc);

-- ============================================================
-- Source health view — for admin/monitoring dashboard
-- ============================================================
create or replace view source_health as
select
  ds.id               as data_source_id,
  ds.name             as source_name,
  ds.slug,
  count(cr.id)        as total_runs_7d,
  count(cr.id) filter (where cr.status = 'success')  as success_7d,
  count(cr.id) filter (where cr.status = 'failed')   as failed_7d,
  round(
    100.0 * count(cr.id) filter (where cr.status = 'success')
    / nullif(count(cr.id), 0), 1
  )                   as success_rate_pct,
  avg(cr.duration_ms) as avg_duration_ms,
  sum(cr.llm_cost_eur) as total_llm_cost_eur_7d,
  max(cr.started_at)  as last_run_at
from data_sources ds
left join connector_runs cr on cr.data_source_id = ds.id
  and cr.started_at > now() - interval '7 days'
group by ds.id, ds.name, ds.slug;

-- ============================================================
-- pg_cron setup (run in Supabase Dashboard → Extensions → pg_cron)
-- Then run these in the SQL editor:
-- ============================================================
-- select cron.schedule(
--   'process-refresh-queue',
--   '*/15 * * * *',   -- every 15 minutes
--   $$
--   select net.http_post(
--     url := current_setting('app.vercel_cron_url'),
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Note: set app.vercel_cron_url and app.cron_secret via:
-- alter database postgres set app.vercel_cron_url = 'https://your-app.vercel.app/api/cron/process-queue';
-- alter database postgres set app.cron_secret = 'your-secret-here';
