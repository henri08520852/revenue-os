-- ============================================================
-- 004: Relationships (network graph — who knows whom)
-- ============================================================

create table relationships (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,

  -- The edge: source_person knows/knows_of target_person
  source_person_id      uuid not null references people(id) on delete cascade,
  target_person_id      uuid not null references people(id) on delete cascade,

  -- Relationship metadata
  relationship_type     text not null default 'direct'
                        check (relationship_type in ('direct','colleague','acquaintance','intro_possible','met_once')),
  relationship_strength int default 50 check (relationship_strength between 0 and 100),

  -- Who from our team owns/manages this relationship
  relationship_owner    text,           -- 'henri' | 'simon'

  last_interaction_at   timestamptz,
  source                text,           -- 'linkedin_import' | 'manual' | 'gmail'
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Directed graph: A→B and B→A are separate edges
  unique(source_person_id, target_person_id),
  -- Cannot relate person to themselves
  check (source_person_id != target_person_id)
);

create index idx_relationships_source
  on relationships(source_person_id);

create index idx_relationships_target
  on relationships(target_person_id);

-- Find all relationships for a given company (via people)
create index idx_relationships_project
  on relationships(project_id);

create trigger trg_relationships_updated_at
  before update on relationships
  for each row execute function update_updated_at();
