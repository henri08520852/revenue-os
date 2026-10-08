-- ============================================================
-- 014: Leads (pre-pipeline outreach, converted into opportunities)
-- Mirrors the table that already exists live in Supabase
-- (applied there as "add_leads_and_opportunity_contacts").
-- Idempotent: safe to run against the live DB.
-- ============================================================

create table if not exists leads (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid not null,
  company_id                  uuid references companies(id) on delete cascade,
  person_id                   uuid references people(id) on delete set null,
  name                        text,
  stage                       text not null default 'outreach'
                              check (stage in ('outreach','replied','discovery','qualified','disqualified')),
  source                      text default 'manual',
  owner_name                  text,
  notes                       text,
  converted_to_opportunity_id uuid references opportunities(id) on delete set null,
  converted_at                timestamptz,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);
