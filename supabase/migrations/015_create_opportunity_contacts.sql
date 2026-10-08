-- ============================================================
-- 015: Opportunity contacts (buying center per deal)
-- Mirrors the table that already exists live in Supabase.
-- Idempotent: safe to run against the live DB.
-- ============================================================

create table if not exists opportunity_contacts (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  person_id       uuid not null references people(id) on delete cascade,
  role            text default 'stakeholder'
                  check (role in ('primary','stakeholder','economic_buyer','champion','blocker')),
  created_at      timestamptz default now(),
  unique (opportunity_id, person_id)
);
