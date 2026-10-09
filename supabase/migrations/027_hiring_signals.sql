-- 027: Hiring signals — job postings from external sources (BA Jobbörse, Google Jobs, …)
-- grouped per employer to find companies with recruiting pressure ("Heiße Firmen").

create table if not exists job_postings (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  source         text not null,            -- 'ba' | 'google_jobs' | …
  external_id    text not null,            -- id at the source (BA refnr, Google job_id)
  employer_key   text not null,            -- normalized employer name (grouping key)
  employer_name  text not null,
  title          text not null,
  role_key       text,                     -- normalized title, to spot repeated roles
  location       text,
  country        text,                     -- DE | AT | CH
  url            text,
  ats            text,                     -- detected applicant tracking system (personio, softgarden, …)
  published_at   timestamptz,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (project_id, source, external_id)
);

create index if not exists idx_job_postings_employer on job_postings(project_id, employer_key);
create index if not exists idx_job_postings_seen on job_postings(project_id, last_seen_at);

-- Candidates found through hiring pressure carry their numbers and a score
alter table candidate_companies add column if not exists hiring jsonb;
alter table candidate_companies add column if not exists score int;
alter table candidate_companies add column if not exists updated_at timestamptz;
create index if not exists idx_candidate_companies_name on candidate_companies(project_id, normalized_name);

-- Same access rule as every other project table (migration 024)
alter table job_postings enable row level security;
drop policy if exists job_postings_member_all on job_postings;
create policy job_postings_member_all on job_postings for all to authenticated
  using (is_project_member(project_id)) with check (is_project_member(project_id));
revoke all on job_postings from anon;
