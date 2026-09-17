-- ============================================================
-- 010: Jobs (career page job tracking)
-- One row per unique job posting. Updated on each connector run.
-- ============================================================

create table jobs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  data_source_id  uuid not null references data_sources(id),

  -- Job data (as scraped)
  title           text not null,
  normalized_title text,          -- lowercase, trimmed, for dedup/grouping
  department      text,
  location        text,           -- raw location string
  location_city   text,           -- extracted city
  job_type        text,           -- 'full_time' | 'part_time' | 'contract' | 'internship'

  -- Role classification (deterministic — keyword-based, no Claude for V1)
  role_category   text not null default 'other'
                  check (role_category in (
                    'commercial',    -- Sales, BD, Account Management, CS
                    'recruiter',     -- Recruiter, Talent Acquisition, HR
                    'hr',            -- HR Generalist, People Ops, Compensation
                    'engineering',   -- Software, Data, Infrastructure
                    'operations',    -- Ops, Finance, Legal, Admin
                    'leadership',    -- CxO, VP, Director, Head of
                    'marketing',     -- Marketing, Content, Growth
                    'other'
                  )),

  -- Source
  source_url      text,           -- direct link to job posting
  external_id     text,           -- ATS-assigned job ID (for reliable dedup)

  -- Lifecycle
  status          text not null default 'active'
                  check (status in ('active', 'removed')),
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  removed_at      timestamptz,

  -- How long has this job been open? (for "long open role" signal)
  days_open       int generated always as (
    extract(day from coalesce(removed_at, now()) - first_seen_at)::int
  ) stored,

  -- Dedup key: hash of (normalized_title + location_city + company_id)
  -- prevents double-counting same job across refreshes
  content_hash    text not null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(company_id, data_source_id, content_hash)
);

create index idx_jobs_company_status
  on jobs(company_id, status);

create index idx_jobs_company_category
  on jobs(company_id, role_category, status);

-- For detecting repeated roles across a company
create index idx_jobs_company_title
  on jobs(company_id, normalized_title)
  where status = 'active';

-- For "jobs added in last N days" queries
create index idx_jobs_first_seen
  on jobs(company_id, first_seen_at desc)
  where status = 'active';

create trigger trg_jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

-- ============================================================
-- Role classification function (pure keyword matching — no LLM)
-- Hireflow-specific but lives in DB for reuse
-- ============================================================
create or replace function classify_job_role(p_title text)
returns text language plpgsql immutable as $$
declare
  v_lower text := lower(p_title);
begin
  -- Leadership first (titles like "Head of Sales" should be leadership, not commercial)
  if v_lower ~* '\y(ceo|coo|cfo|cto|cpo|vp|vice president|head of|chief|director|managing director|geschäftsführer|leiter|leiterin)\y' then
    return 'leadership';
  end if;

  -- Recruiter / Talent Acquisition
  if v_lower ~* '\y(recruiter|recruiting|recruitment|talent acquisition|talent partner|personalreferent|hr business partner|people partner|hiring|sourcer|headhunter)\y' then
    return 'recruiter';
  end if;

  -- Commercial: Sales, BD, CS, Account
  if v_lower ~* '\y(sales|vertrieb|account (executive|manager|director)|business development|customer success|customer experience|revenue|commercial|closing|ae |sdr|bdr|inside sales|außendienst)\y' then
    return 'commercial';
  end if;

  -- Marketing
  if v_lower ~* '\y(marketing|growth|demand generation|content|seo|sem|brand|communications|pr |public relations|social media)\y' then
    return 'marketing';
  end if;

  -- HR (broader people ops, not recruiting-specific)
  if v_lower ~* '\y(hr |human resources|people ops|people operations|compensation|benefits|payroll|personalwesen|people & culture)\y' then
    return 'hr';
  end if;

  -- Engineering
  if v_lower ~* '\y(engineer|developer|software|backend|frontend|fullstack|devops|data scientist|ml engineer|platform|infrastructure|architect|sre|qa|quality assurance)\y' then
    return 'engineering';
  end if;

  -- Operations
  if v_lower ~* '\y(operations|finance|controller|accounting|legal|compliance|office manager|assistant|admin|logistics|supply chain)\y' then
    return 'operations';
  end if;

  return 'other';
end;
$$;
