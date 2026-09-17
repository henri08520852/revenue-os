-- ============================================================
-- 008: Source Subscriptions (the refresh queue)
-- This table IS the queue. pg_cron reads next_check_at.
-- ============================================================

create table source_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  data_source_id    uuid not null references data_sources(id),

  -- State
  enabled           bool default true,
  priority          text default 'normal'
                    check (priority in ('low','normal','high','urgent')),

  -- Refresh schedule
  -- If null, inherits data_sources.default_refresh_hours
  refresh_hours     int,

  -- Queue tracking
  last_checked_at   timestamptz,
  next_check_at     timestamptz default now(),   -- initially due immediately
  last_success_at   timestamptz,

  -- Health tracking
  failure_count     int default 0,
  last_error        text,
  consecutive_empty int default 0,               -- runs with zero jobs found (career pages)

  -- Source-specific config (stored after discovery)
  -- career_page: {"career_page_url": "...", "ats_type": "lever", "requires_js": false,
  --               "feed_url": "https://jobs.lever.co/acme"}
  -- gmail: {"last_history_id": "...", "sync_from": "2026-01-01"}
  config            jsonb not null default '{}',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique(company_id, data_source_id)
);

-- THE CRITICAL INDEX: drives queue processor performance
-- Only enabled subscriptions with failures under threshold
create index idx_source_subs_queue
  on source_subscriptions(next_check_at asc)
  where enabled = true and failure_count < 5;

-- Priority queue variant
create index idx_source_subs_priority_queue
  on source_subscriptions(priority desc, next_check_at asc)
  where enabled = true and failure_count < 5;

create index idx_source_subs_company
  on source_subscriptions(company_id);

create trigger trg_source_subs_updated_at
  before update on source_subscriptions
  for each row execute function update_updated_at();

-- ============================================================
-- Helper function: schedule next check based on account status + priority
-- Call this after each connector run to set next_check_at
-- ============================================================
create or replace function schedule_next_check(
  p_subscription_id uuid,
  p_success bool,
  p_account_status text default 'target'
)
returns void language plpgsql as $$
declare
  v_refresh_hours int;
  v_base_hours int;
  v_sub record;
begin
  select * into v_sub from source_subscriptions where id = p_subscription_id;

  -- Adaptive refresh based on account status
  v_base_hours := coalesce(
    v_sub.refresh_hours,
    (select default_refresh_hours from data_sources where id = v_sub.data_source_id)
  );

  v_refresh_hours := case p_account_status
    when 'hot'         then greatest(4,  v_base_hours / 6)
    when 'active_deal' then greatest(4,  v_base_hours / 6)
    when 'warm'        then greatest(12, v_base_hours / 2)
    when 'customer'    then greatest(24, v_base_hours)
    else                    v_base_hours    -- target/inactive: use default
  end;

  if p_success then
    update source_subscriptions set
      last_success_at   = now(),
      failure_count     = 0,
      last_error        = null,
      last_checked_at   = now(),
      next_check_at     = now() + (v_refresh_hours || ' hours')::interval
    where id = p_subscription_id;
  else
    -- Exponential backoff on failure (max 48h)
    update source_subscriptions set
      failure_count   = failure_count + 1,
      last_checked_at = now(),
      next_check_at   = now() + (
        least(48, v_refresh_hours * power(2, failure_count)) || ' hours'
      )::interval
    where id = p_subscription_id;
  end if;
end;
$$;
