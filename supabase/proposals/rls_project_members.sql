-- ============================================================
-- PROPOSAL — NOT APPLIED: Row Level Security for revenue-os
--
-- Lives in supabase/proposals/ on purpose so `supabase db push`
-- does not pick it up. Move to supabase/migrations/ once reviewed.
--
-- Model: a user may access a row iff they are a member of the row's
-- project (project_members). Cron/API routes use the service role key
-- and bypass RLS, so background jobs keep working unchanged.
--
-- ROLLOUT ORDER (important — otherwise you lock yourself out):
--   1. Run PART A (creates project_members, no RLS yet).
--   2. Run PART B with your own user id(s) filled in, then verify with
--      the check query below that the membership exists.
--   3. Run PART C (enables RLS + policies) — ideally on a Supabase
--      branch first, click through the app, then on production.
--   Rollback: PART D.
-- ============================================================


-- ------------------------------------------------------------
-- PART A: membership table + helper
-- (project_members already exists since migration 020 — the app adds
--  each user on first login. Once RLS is on, that self-insert is blocked,
--  so new team members must be added via SQL / service role.)
-- ------------------------------------------------------------
create table if not exists project_members (
  project_id  uuid not null references projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','member')),
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists idx_project_members_user on project_members(user_id);

-- SECURITY DEFINER so policies can check membership without recursing
-- into project_members' own RLS. search_path pinned for safety.
create or replace function is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;
revoke all on function is_project_member(uuid) from public, anon;
grant execute on function is_project_member(uuid) to authenticated;


-- ------------------------------------------------------------
-- PART B: seed membership (fill in manually — do not commit real ids)
-- Find your id: select id, email from auth.users;
-- ------------------------------------------------------------
-- insert into project_members (project_id, user_id, role)
-- values ('<NEXT_PUBLIC_DEFAULT_PROJECT_ID>', '<your auth.users.id>', 'owner')
-- on conflict do nothing;
--
-- Check:
-- select * from project_members;


-- ------------------------------------------------------------
-- PART C: enable RLS + policies
-- ------------------------------------------------------------
do $$
declare
  t text;
  -- every revenue-os table with a project_id column
  project_tables text[] := array[
    'actions','activities','candidate_companies','companies','connector_runs',
    'discovery_searches','jobs','leads','observations','opportunities',
    'opportunity_stage_history','people','relationships','signals','source_subscriptions','tasks'
  ];
begin
  foreach t in array project_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (is_project_member(project_id))
         with check (is_project_member(project_id))',
      t || '_member_all', t);
    -- The anon key is public (shipped to the browser): no access without login
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- projects: members can read their projects; changes only via service role
alter table projects enable row level security;
drop policy if exists projects_member_select on projects;
create policy projects_member_select on projects
  for select to authenticated using (is_project_member(id));
revoke all on projects from anon;

-- opportunity_contacts has no project_id → scope through the opportunity
alter table opportunity_contacts enable row level security;
drop policy if exists opportunity_contacts_member_all on opportunity_contacts;
create policy opportunity_contacts_member_all on opportunity_contacts
  for all to authenticated
  using (exists (select 1 from opportunities o
                 where o.id = opportunity_id and is_project_member(o.project_id)))
  with check (exists (select 1 from opportunities o
                      where o.id = opportunity_id and is_project_member(o.project_id)));
revoke all on opportunity_contacts from anon;

-- data_sources: global connector catalogue (no project_id) → read-only for users
alter table data_sources enable row level security;
drop policy if exists data_sources_read on data_sources;
create policy data_sources_read on data_sources
  for select to authenticated using (true);
revoke all on data_sources from anon;

-- project_members: members see their team (settings page, owner pickers) and may
-- edit their own display name; adding members only via service role / SQL editor
alter table project_members enable row level security;
drop policy if exists project_members_self_select on project_members;
drop policy if exists project_members_team_select on project_members;
create policy project_members_team_select on project_members
  for select to authenticated using (is_project_member(project_id));
drop policy if exists project_members_self_update on project_members;
create policy project_members_self_update on project_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on project_members from anon;

-- NOTE: reference_posts belongs to the Marketing/PR agent app that shares
-- this database — intentionally not touched here; secure it from that repo.


-- ------------------------------------------------------------
-- PART D: rollback (only if something breaks)
-- ------------------------------------------------------------
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'actions','activities','candidate_companies','companies','connector_runs',
--     'discovery_searches','jobs','leads','observations','opportunities',
--     'opportunity_stage_history','people','relationships','signals','source_subscriptions','tasks',
--     'projects','opportunity_contacts','data_sources','project_members'
--   ] loop
--     execute format('alter table %I disable row level security', t);
--     execute format('grant select, insert, update, delete on %I to anon', t);
--   end loop;
-- end $$;
