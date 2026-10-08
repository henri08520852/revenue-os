-- ============================================================
-- 018: Deal detail — contact roles + stage history
-- ============================================================

-- Buying-center roles: add decision_maker (primary/blocker kept for existing rows)
alter table opportunity_contacts drop constraint if exists opportunity_contacts_role_check;
alter table opportunity_contacts add constraint opportunity_contacts_role_check
  check (role in ('champion','decision_maker','economic_buyer','stakeholder','primary','blocker'));

-- Stage history: one row per stage change, written by trigger so every
-- path (pipeline drag & drop, deal editor, SQL, cron) is captured
create table if not exists opportunity_stage_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  changed_at      timestamptz not null default now(),
  changed_by      uuid default auth.uid()
);

create index if not exists idx_opportunity_stage_history_opp
  on opportunity_stage_history(opportunity_id, changed_at desc);

create or replace function log_opportunity_stage_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into opportunity_stage_history (opportunity_id, project_id, from_stage, to_stage)
    values (new.id, new.project_id, case when tg_op = 'UPDATE' then old.stage end, new.stage);
  end if;
  return null;
end $$;

drop trigger if exists trg_opportunities_stage_history on opportunities;
create trigger trg_opportunities_stage_history
  after insert or update of stage on opportunities
  for each row execute function log_opportunity_stage_change();

-- Keep won_at / lost_at in sync with the stage
create or replace function set_opportunity_outcome_dates()
returns trigger language plpgsql as $$
begin
  if new.stage = 'won' and new.won_at is null then new.won_at := now(); end if;
  if new.stage = 'lost' and new.lost_at is null then new.lost_at := now(); end if;
  if new.stage <> 'won' then new.won_at := null; end if;
  if new.stage <> 'lost' then new.lost_at := null; end if;
  return new;
end $$;

drop trigger if exists trg_opportunities_outcome_dates on opportunities;
create trigger trg_opportunities_outcome_dates
  before insert or update of stage on opportunities
  for each row execute function set_opportunity_outcome_dates();

-- Backfill: starting point for deals that have no history yet
insert into opportunity_stage_history (opportunity_id, project_id, from_stage, to_stage, changed_at, changed_by)
select o.id, o.project_id, null, o.stage, o.created_at, null
from opportunities o
where not exists (select 1 from opportunity_stage_history h where h.opportunity_id = o.id);
