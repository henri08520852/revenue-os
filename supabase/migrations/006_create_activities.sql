-- ============================================================
-- 006: Activities (all internal interactions — CRM memory)
-- ============================================================

create table activities (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  company_id      uuid references companies(id) on delete set null,
  person_id       uuid references people(id) on delete set null,
  opportunity_id  uuid references opportunities(id) on delete set null,

  activity_type   text not null
                  check (activity_type in (
                    'email','call','meeting','linkedin_comment','linkedin_message',
                    'linkedin_connection','whatsapp','intro','note','proposal',
                    'event_meeting','manual_research','voice_note'
                  )),

  direction       text check (direction in ('inbound','outbound','internal')),
  occurred_at     timestamptz not null,
  channel         text,

  -- Content
  summary         text,           -- human-readable summary
  raw_reference   text,           -- gmail thread ID, calendar event ID, etc.

  -- Structured sales intelligence extracted from this activity
  -- (filled by Claude when source is voice_note or unstructured email)
  extracted_intel jsonb default '{}',
  -- e.g. {"pain": "...", "champion": "...", "objection": "...",
  --        "next_step": "...", "economic_buyer": "...", "timing": "..."}

  outcome         text,
  next_step_detected text,

  -- Provenance
  created_by      text,           -- 'henri' | 'simon' | 'system'
  source          text,           -- 'gmail' | 'calendar' | 'manual' | 'linkedin_import' | 'voice'

  created_at      timestamptz not null default now()
  -- No updated_at — activities are mostly immutable records
);

create index idx_activities_company_time
  on activities(company_id, occurred_at desc)
  where company_id is not null;

create index idx_activities_opportunity
  on activities(opportunity_id, occurred_at desc)
  where opportunity_id is not null;

create index idx_activities_project_type
  on activities(project_id, activity_type, occurred_at desc);
