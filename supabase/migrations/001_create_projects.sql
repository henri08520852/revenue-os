-- ============================================================
-- 001: Projects (workspace isolation root)
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fuzzy name matching

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  -- ICP, signal weights, playbook config per project
  config      jsonb not null default '{
    "icp": {
      "countries": ["DE", "AT", "CH"],
      "employee_min": 30,
      "employee_max": 500,
      "industries": []
    },
    "signal_weights": {
      "hiring_acceleration": 25,
      "commercial_hiring": 20,
      "recruiter_vacancy": 20,
      "repeated_role": 15,
      "new_head_of_people": 20
    },
    "scoring": {
      "hiring_acceleration_threshold_pct": 40,
      "hiring_acceleration_threshold_abs": 4,
      "hiring_acceleration_window_days": 14,
      "repeated_role_min_count": 3,
      "commercial_role_min_count": 2,
      "recruiter_role_min_count": 1
    }
  }',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function update_updated_at();
