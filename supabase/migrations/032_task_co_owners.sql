-- ============================================================
-- 032: Several people on one task (e.g. Henri + Simon at the tax advisor)
--   owner_id stays the main assignee (used by agents, rollups, calendar);
--   co_owner_ids holds everyone else who is also responsible.
-- ============================================================
alter table tasks add column if not exists co_owner_ids uuid[] not null default '{}';
create index if not exists idx_tasks_co_owners on tasks using gin (co_owner_ids);
