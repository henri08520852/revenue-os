-- ============================================================
-- 005: Opportunities (deals / pipeline)
-- ============================================================

create table opportunities (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references projects(id) on delete cascade,
  company_id                uuid not null references companies(id) on delete cascade,

  name                      text,
  stage                     text not null default 'discovery'
                            check (stage in ('discovery','qualified','proposal','pilot','negotiation','won','lost')),

  -- Value
  potential_value           numeric,
  currency                  text default 'EUR',
  probability               int default 10 check (probability between 0 and 100),

  -- Deal intelligence (filled progressively — all nullable, missing = NBA signal)
  pain                      text,           -- what's their actual problem?
  champion_person_id        uuid references people(id) on delete set null,
  economic_buyer_person_id  uuid references people(id) on delete set null,
  decision_date             date,
  decision_process          text,           -- how do they make this decision?
  competition               text,

  -- Progress
  next_step                 text,
  next_step_due_at          timestamptz,
  current_blocker           text,

  -- Pilot
  pilot_status              text,
  pilot_success_metric      text,

  -- Outcome
  lost_reason               text,
  won_at                    timestamptz,
  lost_at                   timestamptz,

  notes                     text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_opportunities_company
  on opportunities(company_id, stage);

create index idx_opportunities_overdue
  on opportunities(project_id, next_step_due_at)
  where stage not in ('won', 'lost') and next_step_due_at is not null;

create index idx_opportunities_active
  on opportunities(project_id, stage, probability desc)
  where stage not in ('won', 'lost');

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function update_updated_at();
