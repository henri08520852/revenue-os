-- ============================================================
-- 012: Actions (NBA candidates — the Today Queue)
-- ============================================================

create table actions (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  company_id          uuid not null references companies(id) on delete cascade,
  person_id           uuid references people(id) on delete set null,
  opportunity_id      uuid references opportunities(id) on delete set null,
  trigger_signal_id   uuid references signals(id) on delete set null,

  -- What to do
  action_type         text not null
                      check (action_type in (
                        'ask_intro',          -- ask relationship for introduction
                        'call',               -- call prospect
                        'send_email',         -- send email
                        'send_whatsapp',      -- send WhatsApp message
                        'linkedin_comment',   -- comment on their post
                        'linkedin_connect',   -- send connection request
                        'linkedin_message',   -- send LinkedIn DM
                        'attend_event',       -- attend event where target is
                        'research_buyer',     -- find/identify the right contact
                        'research_company',   -- investigate company further
                        'prepare_meeting',    -- prep for upcoming meeting
                        'follow_up',          -- follow up on prior outreach
                        'send_proposal',      -- prepare/send proposal
                        'review_pilot',       -- check in on pilot
                        'ask_referral',       -- ask customer for referral
                        'wait'                -- explicitly: do nothing now
                      )),

  -- Human-readable content
  title               text not null,        -- "Call Anna Müller"
  description         text,                 -- detailed recommendation
  suggested_content   text,                 -- draft message / comment / call opener (Claude-generated when useful)

  -- Scoring (all 0-100, computed by NBA engine)
  priority_score      int not null default 0 check (priority_score between 0 and 100),
  urgency             int default 50 check (urgency between 0 and 100),
  expected_impact     int default 50 check (expected_impact between 0 and 100),
  estimated_minutes   int not null default 5,

  -- Structured "why" (drives explainability — every field required for NBA display)
  reason              jsonb not null default '{}',
  -- {
  --   "why_account": "11 open roles, 3 commercial, strong ICP fit",
  --   "why_now": "Hiring up 120% in 8 days — peak buying intent",
  --   "why_person": "Head of People, direct LinkedIn connection via Henri",
  --   "why_channel": "Previous call successful, prefers phone",
  --   "why_action": "Warm path available — ask COO for intro to Head of People"
  -- }

  -- State
  status              text not null default 'pending'
                      check (status in ('pending','completed','dismissed','snoozed')),
  due_at              timestamptz,
  snoozed_until       timestamptz,

  -- Outcome logging (filled when user marks complete)
  outcome             text,   -- 'positive' | 'neutral' | 'negative' | 'no_response'
  outcome_notes       text,
  outcome_logged_at   timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Today Queue index — the primary display query
create index idx_actions_today_queue
  on actions(project_id, priority_score desc, estimated_minutes asc)
  where status = 'pending';

-- For time-budget optimization query
create index idx_actions_pending_time
  on actions(project_id, estimated_minutes asc, priority_score desc)
  where status = 'pending';

-- For outcome analysis (signal learning)
create index idx_actions_outcomes
  on actions(project_id, action_type, outcome, outcome_logged_at)
  where outcome is not null;

create trigger trg_actions_updated_at
  before update on actions
  for each row execute function update_updated_at();

-- ============================================================
-- Time budget optimizer (pure SQL — no LLM needed)
-- Returns highest-value action combination within minute budget
-- Simple greedy: sort by priority desc, take until budget exhausted
-- ============================================================
create or replace function get_today_queue(
  p_project_id uuid,
  p_minutes_available int default 30,
  p_limit int default 10
)
returns table (
  action_id         uuid,
  action_type       text,
  title             text,
  description       text,
  company_name      text,
  person_name       text,
  priority_score    int,
  estimated_minutes int,
  reason            jsonb,
  cumulative_minutes int
) language sql stable as $$
  with ranked_actions as (
    select
      a.id,
      a.action_type,
      a.title,
      a.description,
      c.name          as company_name,
      p.full_name     as person_name,
      a.priority_score,
      a.estimated_minutes,
      a.reason,
      sum(a.estimated_minutes) over (
        order by a.priority_score desc, a.urgency desc, a.created_at asc
        rows unbounded preceding
      ) as cumulative_minutes
    from actions a
    join companies c on c.id = a.company_id
    left join people p on p.id = a.person_id
    where a.project_id = p_project_id
      and a.status = 'pending'
      and (a.snoozed_until is null or a.snoozed_until < now())
    order by a.priority_score desc, a.urgency desc, a.created_at asc
  )
  select
    id, action_type, title, description,
    company_name, person_name,
    priority_score, estimated_minutes, reason, cumulative_minutes
  from ranked_actions
  where cumulative_minutes <= p_minutes_available
  limit p_limit;
$$;
