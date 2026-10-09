-- 028: Career sites on applicant tracking systems (Personio, Recruitee, Greenhouse, …).
-- Found in the Common Crawl index, then their public job feeds are checked in rotation.

create table if not exists ats_accounts (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  ats              text not null,            -- personio | recruitee | greenhouse | lever | workable | smartrecruiters
  slug             text not null,            -- account name at the system (acme in acme.jobs.personio.de)
  employer_name    text,
  employer_key     text,
  status           text not null default 'new', -- new | active | empty | not_dach | gone
  open_count       int,
  country          text,                     -- DE | AT | CH (most frequent among the jobs)
  discovered_at    timestamptz not null default now(),
  last_checked_at  timestamptz,
  next_check_at    timestamptz not null default now(),
  error            text,
  unique (project_id, ats, slug)
);
create index if not exists idx_ats_accounts_due on ats_accounts(project_id, next_check_at);

-- Progress through the crawl index, per search pattern
create table if not exists ats_discovery_state (
  project_id   uuid not null references projects(id) on delete cascade,
  pattern      text not null,               -- e.g. *.jobs.personio.de
  collection   text,                        -- Common Crawl collection, e.g. CC-MAIN-2026-38
  page         int not null default 0,
  num_pages    int,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (project_id, pattern)
);

-- Same access rule as every other project table (migration 024)
do $$
declare t text;
begin
  foreach t in array array['ats_accounts', 'ats_discovery_state'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member_all', t);
    execute format('create policy %I on %I for all to authenticated using (is_project_member(project_id)) with check (is_project_member(project_id))', t || '_member_all', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
