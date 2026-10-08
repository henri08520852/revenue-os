-- ============================================================
-- 024: Row Level Security for all revenue-os tables
--
-- Rule: a signed-in user may read/write a row only if they are a member of
-- the row's project (project_members). Without login (anon key, which ships
-- to the browser) there is no access at all.
--
-- Unaffected: everything that runs with the service role key (Gmail/Calendar
-- sync, cron jobs, connector queue, Gmail add-on API) bypasses RLS.
-- Not touched: tables of the Marketing/PR agent (Content Studio) that share
-- this database (reference_posts, content_*, visual_performance, …).
--
-- New team members: on first login the app calls join_project(), which only
-- admits verified accounts of the company domain (altoris.one).
--
-- Rollback: see the block at the end of this file.
-- ============================================================

-- Membership check used by every policy. SECURITY DEFINER so it can read
-- project_members without recursing into that table's own policies.
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

-- Self-service join for colleagues: only a verified @altoris.one login, only as
-- 'member', only for an existing project. Returns true when the caller is a member.
create or replace function join_project(p_project_id uuid, p_display_name text default null)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_verified boolean := coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false)
                        or exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null);
begin
  if auth.uid() is null then return false; end if;
  if is_project_member(p_project_id) then return true; end if;
  if v_email not like '%@altoris.one' or not v_verified then return false; end if;
  if not exists (select 1 from projects where id = p_project_id) then return false; end if;
  insert into project_members (project_id, user_id, role, display_name, email)
  values (p_project_id, auth.uid(), 'member', nullif(trim(p_display_name), ''), v_email)
  on conflict (project_id, user_id) do nothing;
  return true;
end;
$$;
revoke all on function join_project(uuid, text) from public, anon;
grant execute on function join_project(uuid, text) to authenticated;

-- Tables with a project_id column: full access for members
do $$
declare
  t text;
begin
  foreach t in array array[
    'actions','activities','candidate_companies','companies','connector_runs',
    'discovery_searches','jobs','leads','observations','opportunities',
    'opportunity_stage_history','people','relationships','signals','source_subscriptions','tasks'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_member_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (is_project_member(project_id))
         with check (is_project_member(project_id))',
      t || '_member_all', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- projects: members read their project; changes only via service role
alter table projects enable row level security;
drop policy if exists projects_member_select on projects;
create policy projects_member_select on projects
  for select to authenticated using (is_project_member(id));
revoke all on projects from anon;

-- opportunity_contacts has no project_id → scoped through its deal
alter table opportunity_contacts enable row level security;
drop policy if exists opportunity_contacts_member_all on opportunity_contacts;
create policy opportunity_contacts_member_all on opportunity_contacts
  for all to authenticated
  using (exists (select 1 from opportunities o where o.id = opportunity_id and is_project_member(o.project_id)))
  with check (exists (select 1 from opportunities o where o.id = opportunity_id and is_project_member(o.project_id)));
revoke all on opportunity_contacts from anon;

-- data_sources: global connector catalogue → read-only for signed-in users
alter table data_sources enable row level security;
drop policy if exists data_sources_read on data_sources;
create policy data_sources_read on data_sources
  for select to authenticated using (true);
revoke all on data_sources from anon;

-- project_members: members see their team and may edit their own profile;
-- joining only via join_project() (or the SQL editor)
alter table project_members enable row level security;
drop policy if exists project_members_team_select on project_members;
create policy project_members_team_select on project_members
  for select to authenticated using (is_project_member(project_id));
drop policy if exists project_members_self_update on project_members;
create policy project_members_self_update on project_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on project_members from anon;

-- calendar_events (021) was readable by any signed-in user → members only
drop policy if exists calendar_events_read on calendar_events;
create policy calendar_events_read on calendar_events
  for select to authenticated using (is_project_member(project_id));

-- ------------------------------------------------------------
-- ROLLBACK (only if something breaks) – run in the SQL editor:
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
