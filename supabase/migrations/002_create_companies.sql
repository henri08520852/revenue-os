-- ============================================================
-- 002: Companies
-- ============================================================

create table companies (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,

  -- Identity (domain is primary dedup key)
  name                  text not null,
  normalized_name       text,           -- lowercase, stripped legal suffixes (GmbH, AG, etc.)
  domain                text,           -- e.g. "acme.com" — no www, no https, no trailing slash
  website_url           text,
  linkedin_url          text,
  google_place_id       text,

  -- Location
  country               text default 'DE',
  region                text,
  city                  text,

  -- Firmographics
  industry              text,
  employee_range        text,           -- "50-200" — human readable
  employee_estimate     int,            -- mid-point for scoring

  -- Scoring (computed by scoring engine, stored for fast query)
  icp_score             int check (icp_score between 0 and 100),
  account_score         int check (account_score between 0 and 100),
  signal_score          int check (signal_score between 0 and 100),
  data_coverage_score   int check (data_coverage_score between 0 and 100),

  -- Account lifecycle
  account_status        text not null default 'target'
                        check (account_status in ('target','warm','hot','active_deal','customer','inactive')),

  -- Denormalized current metrics — updated atomically with each connector run
  -- Allows fast queries without hitting the observations table
  -- e.g. {"open_jobs": 11, "commercial_jobs": 3, "recruiter_jobs": 1,
  --        "repeated_roles": ["Sales Manager"], "jobs_updated_at": "2026-09-09T06:00:00Z",
  --        "career_page_url": "https://acme.com/jobs", "ats_type": "lever"}
  current_metrics       jsonb not null default '{}',

  -- Freshness tracking
  last_signal_at        timestamptz,
  last_enriched_at      timestamptz,

  -- Provenance
  source                text,           -- 'manual' | 'csv_import' | 'linkedin_import' | 'google_places'
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Domain must be unique within a project (main dedup key)
  unique(project_id, domain)
);

-- Indexes
create index idx_companies_project_score
  on companies(project_id, account_score desc nulls last)
  where account_status != 'inactive';

create index idx_companies_domain
  on companies(domain);

create index idx_companies_status
  on companies(project_id, account_status);

-- Trigram index for fuzzy name search
create index idx_companies_name_trgm
  on companies using gin(normalized_name gin_trgm_ops);

create trigger trg_companies_updated_at
  before update on companies
  for each row execute function update_updated_at();

-- Auto-normalize domain on insert/update
create or replace function normalize_company_domain()
returns trigger language plpgsql as $$
begin
  -- Strip protocol, www, trailing slash, lowercase
  if new.domain is not null then
    new.domain = lower(
      regexp_replace(
        regexp_replace(new.domain, '^https?://(www\.)?', ''),
        '/.*$', ''
      )
    );
  end if;
  -- Normalize name: lowercase, strip common German legal suffixes
  if new.name is not null then
    new.normalized_name = lower(
      trim(regexp_replace(
        new.name,
        '\s*(GmbH|AG|KG|OHG|GbR|e\.V\.|mbH|& Co\. KG|SE|UG|Ltd\.?|Inc\.?|Corp\.?)\.?\s*$',
        '', 'i'
      ))
    );
  end if;
  return new;
end;
$$;

create trigger trg_companies_normalize
  before insert or update of name, domain on companies
  for each row execute function normalize_company_domain();
