-- ============================================================
-- 016: Leads — follow-up date, board stages, indexes, updated_at
-- ============================================================

-- Follow-up date (drives the "Fällig" list on /today)
alter table leads add column if not exists next_follow_up_at timestamptz;

-- Board stages: outreach → contacted → qualified → converted | disqualified
-- Map legacy values before swapping the check constraint.
update leads set stage = 'contacted' where stage = 'replied';
update leads set stage = 'qualified' where stage = 'discovery';

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('outreach','contacted','qualified','converted','disqualified'));

-- project_id FK (missing on the live table)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_project_id_fkey') then
    alter table leads add constraint leads_project_id_fkey
      foreign key (project_id) references projects(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_leads_board
  on leads(project_id, stage, created_at desc);

create index if not exists idx_leads_follow_up
  on leads(project_id, next_follow_up_at)
  where next_follow_up_at is not null and stage not in ('converted','disqualified');

create index if not exists idx_leads_company on leads(company_id);
create index if not exists idx_leads_person on leads(person_id);
create index if not exists idx_opportunity_contacts_person on opportunity_contacts(person_id);

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
  before update on leads
  for each row execute function update_updated_at();
