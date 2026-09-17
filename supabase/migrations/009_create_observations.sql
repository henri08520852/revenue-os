-- ============================================================
-- 009: Observations (append-only historical record)
-- NEVER update rows in this table. Only insert.
-- ============================================================

create table observations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  person_id         uuid references people(id) on delete set null,
  data_source_id    uuid not null references data_sources(id),

  -- What type of observation is this?
  observation_type  text not null,
  -- 'job_snapshot'    — count of jobs at a point in time
  -- 'job_added'       — specific new job detected
  -- 'job_removed'     — specific job no longer visible
  -- 'website_change'  — website content changed
  -- 'person_detected' — new person found at company
  -- 'news_item'       — news article relevant to company
  -- 'funding'         — funding event detected

  metric_name       text not null,
  -- 'open_jobs' | 'commercial_jobs' | 'recruiter_jobs' | 'engineering_jobs'
  -- 'hr_jobs' | 'executive_jobs' | 'website_hash' | etc.

  -- Values (use whichever fits the metric)
  value_numeric     numeric,
  value_text        text,
  value_json        jsonb,

  -- Evidence (always store source for explainability)
  source_url        text,
  content_hash      text,    -- hash of page/feed for change detection

  -- When was this observed? (not when was it created in DB)
  observed_at       timestamptz not null default now(),

  confidence        int default 80 check (confidence between 0 and 100),

  created_at        timestamptz not null default now()
  -- NO updated_at. Observations are immutable. Mistakes = new observation.
);

-- Primary query pattern: latest observations per company+metric
create index idx_observations_company_metric
  on observations(company_id, metric_name, observed_at desc);

-- For trend queries across a project
create index idx_observations_project_type_time
  on observations(project_id, observation_type, observed_at desc);

-- For signal reprocessing (find all observations of a type in date range)
create index idx_observations_source_time
  on observations(data_source_id, observed_at desc);

-- ============================================================
-- Convenience view: latest observation per company+metric
-- Use this instead of slow DISTINCT ON queries
-- ============================================================
create or replace view latest_observations as
select distinct on (company_id, metric_name)
  id,
  project_id,
  company_id,
  data_source_id,
  observation_type,
  metric_name,
  value_numeric,
  value_text,
  value_json,
  source_url,
  observed_at,
  confidence
from observations
order by company_id, metric_name, observed_at desc;
