-- ============================================================
-- 020: Team members + lead/deal owners
-- project_members is also the basis of the RLS proposal
-- (supabase/proposals/rls_project_members.sql, PART A).
-- Members are added automatically on first login to the app.
-- ============================================================

create table if not exists project_members (
  project_id    uuid not null references projects(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner','member')),
  display_name  text,
  email         text,
  created_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table project_members add column if not exists display_name text;
alter table project_members add column if not exists email text;
create index if not exists idx_project_members_user on project_members(user_id);

alter table leads add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table opportunities add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists idx_leads_owner on leads(project_id, owner_id);
create index if not exists idx_opportunities_owner on opportunities(project_id, owner_id);
