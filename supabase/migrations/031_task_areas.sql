-- ============================================================
-- 031: Task areas — internal Operations / Sales tasks next to Akquise
--   * 'akquise'    = CRM tasks (follow-ups, sequences, deals) — default, all existing rows
--   * 'operations' = internal ops to-dos, no CRM link needed
--   * 'sales'      = internal sales to-dos, CRM link optional
-- ============================================================
alter table tasks add column if not exists area text not null default 'akquise';
alter table tasks drop constraint if exists tasks_area_check;
alter table tasks add constraint tasks_area_check check (area in ('akquise','operations','sales'));
create index if not exists idx_tasks_area on tasks(project_id, area, status);
