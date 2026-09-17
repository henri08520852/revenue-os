-- ============================================================
-- 003: People (contacts)
-- ============================================================

create table people (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  company_id            uuid references companies(id) on delete set null,

  -- Identity
  first_name            text,
  last_name             text,
  full_name             text,           -- computed or overridden
  job_title             text,
  role_category         text            -- 'executive' | 'hr' | 'commercial' | 'technical' | 'operations' | 'other'
                        check (role_category in ('executive','hr','commercial','technical','operations','other')),

  -- Contact
  email                 text,
  phone                 text,
  linkedin_url          text,
  linkedin_id           text,           -- extracted from URL for dedup

  -- Buyer intelligence
  buyer_role            text            -- 'champion' | 'economic_buyer' | 'influencer' | 'blocker' | 'user'
                        check (buyer_role in ('champion','economic_buyer','influencer','blocker','user')),
  is_decision_maker     bool default false,

  -- Relationship
  relationship_owner    text,           -- 'henri' | 'simon' — who owns this relationship
  relationship_strength int default 0 check (relationship_strength between 0 and 100),
  last_interaction_at   timestamptz,

  -- Data quality
  source                text,           -- 'manual' | 'linkedin_import' | 'gmail' | 'csv'
  confidence            int default 80 check (confidence between 0 and 100),
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Dedup indexes (conditional — allow null)
create unique index idx_people_linkedin_id
  on people(project_id, linkedin_id)
  where linkedin_id is not null;

create unique index idx_people_email
  on people(project_id, lower(email))
  where email is not null;

create index idx_people_company
  on people(company_id);

create index idx_people_project_role
  on people(project_id, role_category);

create trigger trg_people_updated_at
  before update on people
  for each row execute function update_updated_at();

-- Auto-compute full_name if not provided
create or replace function compute_person_full_name()
returns trigger language plpgsql as $$
begin
  if new.full_name is null or new.full_name = '' then
    new.full_name = trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  -- Extract linkedin_id from URL if not set
  if new.linkedin_id is null and new.linkedin_url is not null then
    new.linkedin_id = (
      regexp_match(new.linkedin_url, 'linkedin\.com/in/([^/?\s]+)')
    )[1];
  end if;
  return new;
end;
$$;

create trigger trg_people_full_name
  before insert or update of first_name, last_name, full_name, linkedin_url on people
  for each row execute function compute_person_full_name();
