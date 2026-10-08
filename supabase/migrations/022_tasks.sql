-- ============================================================
-- 022: Tasks — one object for follow-ups, next steps and reminders
--   * linked to company / contact / deal / lead
--   * opportunities.next_step(+_due_at) and leads.next_follow_up_at are now
--     DERIVED from the earliest open task (trigger), so existing views and the
--     NBA engine keep working
--   * existing follow-ups / next steps / company reminders are migrated
-- ============================================================

create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  title           text not null,
  notes           text,
  task_type       text not null default 'todo'
                  check (task_type in ('todo','call','email','follow_up','meeting')),
  due_at          timestamptz,
  has_time        boolean not null default false,   -- false = date only
  status          text not null default 'open' check (status in ('open','done')),
  completed_at    timestamptz,
  owner_id        uuid references auth.users(id) on delete set null,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  company_id      uuid references companies(id) on delete cascade,
  person_id       uuid references people(id) on delete set null,
  opportunity_id  uuid references opportunities(id) on delete cascade,
  lead_id         uuid references leads(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tasks_open_due on tasks(project_id, status, due_at);
create index if not exists idx_tasks_owner on tasks(project_id, owner_id, status);
create index if not exists idx_tasks_company on tasks(company_id);
create index if not exists idx_tasks_person on tasks(person_id);
create index if not exists idx_tasks_opportunity on tasks(opportunity_id);
create index if not exists idx_tasks_lead on tasks(lead_id);

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

-- completed_at follows status
create or replace function set_task_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status = 'open' then new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_tasks_completed_at on tasks;
create trigger trg_tasks_completed_at before insert or update of status on tasks
  for each row execute function set_task_completed_at();

-- Derived "next step" (deal) and "next follow-up" (lead) = earliest open task
create or replace function refresh_task_rollups(p_opportunity_id uuid, p_lead_id uuid)
returns void language plpgsql as $$
begin
  if p_opportunity_id is not null then
    update opportunities o
       set (next_step, next_step_due_at) = (
         select t.title, t.due_at from tasks t
          where t.opportunity_id = p_opportunity_id and t.status = 'open'
          order by t.due_at nulls last, t.created_at
          limit 1)
     where o.id = p_opportunity_id;
  end if;
  if p_lead_id is not null then
    update leads l
       set next_follow_up_at = (
         select t.due_at from tasks t
          where t.lead_id = p_lead_id and t.status = 'open' and t.due_at is not null
          order by t.due_at
          limit 1)
     where l.id = p_lead_id;
  end if;
end $$;

create or replace function trg_tasks_rollups()
returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform refresh_task_rollups(old.opportunity_id, old.lead_id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform refresh_task_rollups(new.opportunity_id, new.lead_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_tasks_rollups on tasks;
create trigger trg_tasks_rollups after insert or update or delete on tasks
  for each row execute function trg_tasks_rollups();

-- ── One-time migration of existing follow-ups (idempotent) ─────────────────
insert into tasks (project_id, title, task_type, due_at, owner_id, company_id, opportunity_id, created_by)
select o.project_id, coalesce(nullif(trim(o.next_step), ''), 'Nächster Schritt'), 'todo', o.next_step_due_at,
       o.owner_id, o.company_id, o.id, o.owner_id
  from opportunities o
 where o.stage not in ('won','lost')
   and (o.next_step_due_at is not null or nullif(trim(o.next_step), '') is not null)
   and not exists (select 1 from tasks t where t.opportunity_id = o.id);

insert into tasks (project_id, title, task_type, due_at, owner_id, company_id, person_id, lead_id, created_by)
select l.project_id, 'Follow-up' || coalesce(' – ' || nullif(trim(l.name), ''), ''), 'follow_up', l.next_follow_up_at,
       l.owner_id, l.company_id, l.person_id, l.id, l.owner_id
  from leads l
 where l.stage not in ('converted','disqualified')
   and l.next_follow_up_at is not null
   and not exists (select 1 from tasks t where t.lead_id = l.id);

insert into tasks (project_id, title, task_type, due_at, owner_id, company_id, created_by)
select c.project_id, coalesce(nullif(c.current_metrics->>'follow_up_note', ''), 'Erinnerung'), 'todo',
       (c.current_metrics->>'next_follow_up_at')::timestamptz,
       nullif(c.current_metrics->>'follow_up_owner_id', '')::uuid, c.id,
       nullif(c.current_metrics->>'follow_up_owner_id', '')::uuid
  from companies c
 where c.current_metrics ? 'next_follow_up_at'
   and c.current_metrics->>'next_follow_up_at' is not null;

update companies
   set current_metrics = current_metrics - 'next_follow_up_at' - 'follow_up_note' - 'follow_up_owner_id'
 where current_metrics ? 'next_follow_up_at';
