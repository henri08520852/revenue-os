-- ============================================================
-- 011: Signals (derived from observations — what does it mean?)
-- ============================================================

create table signals (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  person_id       uuid references people(id) on delete set null,

  signal_type     text not null,
  -- Hireflow signals:
  -- 'hiring_acceleration'    — significant job count increase
  -- 'hiring_deceleration'    — significant job count decrease
  -- 'commercial_hiring'      — multiple commercial roles open
  -- 'recruiter_vacancy'      — company hiring recruiters (capacity signal)
  -- 'repeated_role'          — same role posted 3+ times
  -- 'new_head_of_people'     — Head of HR/People role detected
  -- 'warm_relationship'      — warm contact exists at this company
  -- 'overdue_followup'       — next step past due on active opportunity
  -- 'proposal_no_response'   — proposal sent >5 days, no reply
  -- 'upcoming_meeting'       — meeting scheduled in next 24-48h

  -- Strength and confidence (both 0-100)
  strength        int not null check (strength between 0 and 100),
  confidence      int not null default 80 check (confidence between 0 and 100),

  -- Human-readable explanation (required — drives NBA "why" text)
  reason          text not null,
  -- e.g. "Open jobs increased from 5 to 11 (+120%) in 8 days"

  -- Machine-readable evidence (references to source data)
  evidence        jsonb default '{}',
  -- e.g. {"observation_ids": ["uuid1","uuid2"], "job_ids": ["uuid3"],
  --        "prev_count": 5, "curr_count": 11, "window_days": 8}

  -- Temporal
  detected_at     timestamptz not null default now(),
  expires_at      timestamptz,   -- when does this signal stop being relevant?

  -- State
  status          text not null default 'active'
                  check (status in ('active','expired','dismissed')),

  created_at      timestamptz not null default now()
);

-- One active signal of each type per company per day (prevents spam)
create unique index idx_signals_dedup
  on signals(company_id, signal_type, date_trunc('day', detected_at)::date)
  where status = 'active';

create index idx_signals_active_strength
  on signals(project_id, strength desc, detected_at desc)
  where status = 'active';

create index idx_signals_company_active
  on signals(company_id, status, detected_at desc);

-- ============================================================
-- Signal definitions (configurable weights per project)
-- Generic core — project-specific weights in projects.config
-- ============================================================

-- View: Active signals with company context (for NBA engine)
create or replace view active_signals_with_context as
select
  s.*,
  c.name            as company_name,
  c.domain          as company_domain,
  c.account_status  as company_status,
  c.account_score   as company_account_score,
  c.current_metrics as company_metrics
from signals s
join companies c on c.id = s.company_id
where s.status = 'active'
  and (s.expires_at is null or s.expires_at > now());
