-- ============================================================
-- 029: Agents & workflows (command center)
--   * agent_settings       on/off + config per agent
--   * agent_runs           log of every run (manual, cron, event) with AI cost
--   * agent_items          approval queue: drafts and suggestions wait for a human
--   * sequence_enrollments outreach sequence per lead (one task per step)
-- Same access rule as every other project table (migration 024).
-- ============================================================

create table if not exists agent_settings (
  project_id  uuid not null references projects(id) on delete cascade,
  agent_key   text not null,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (project_id, agent_key)
);

create table if not exists agent_runs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  agent_key   text not null,
  trigger     text not null default 'manual' check (trigger in ('manual','cron','event')),
  status      text not null default 'running' check (status in ('running','ok','error','skipped')),
  items       int not null default 0,
  summary     text,
  error       text,
  cost_usd    numeric(10,5) not null default 0,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists idx_agent_runs_recent on agent_runs(project_id, started_at desc);

create table if not exists agent_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  agent_key      text not null,
  run_id         uuid references agent_runs(id) on delete set null,
  kind           text not null,                       -- e.g. 'message_draft'
  status         text not null default 'pending' check (status in ('pending','approved','dismissed')),
  channel        text,                                -- linkedin | email | phone
  title          text not null,
  body           text,
  data           jsonb not null default '{}'::jsonb,
  company_id     uuid references companies(id) on delete cascade,
  person_id      uuid references people(id) on delete cascade,
  lead_id        uuid references leads(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references auth.users(id) on delete set null
);
create index if not exists idx_agent_items_queue on agent_items(project_id, status, created_at desc);
create index if not exists idx_agent_items_person on agent_items(person_id);
create index if not exists idx_agent_items_lead on agent_items(lead_id);

create table if not exists sequence_enrollments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  person_id       uuid references people(id) on delete set null,
  company_id      uuid references companies(id) on delete cascade,
  owner_id        uuid references auth.users(id) on delete set null,
  step            int not null default 0,             -- index of the current step
  current_task_id uuid references tasks(id) on delete set null,
  status          text not null default 'active' check (status in ('active','stopped','done')),
  stop_reason     text,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists uq_sequence_active_lead on sequence_enrollments(lead_id) where status = 'active';
create index if not exists idx_sequence_active on sequence_enrollments(project_id, status);

drop trigger if exists trg_sequence_updated_at on sequence_enrollments;
create trigger trg_sequence_updated_at before update on sequence_enrollments
  for each row execute function update_updated_at();

do $$
declare t text;
begin
  foreach t in array array['agent_settings','agent_runs','agent_items','sequence_enrollments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member_all', t);
    execute format('create policy %I on %I for all to authenticated
                      using (is_project_member(project_id)) with check (is_project_member(project_id))', t || '_member_all', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
