-- ============================================================
-- 017: Align opportunity stages with the app
-- UI, pipeline and NBA engine use erstgespraech/evaluation;
-- the original check (qualified/pilot) rejected those updates.
-- ============================================================

-- Map legacy values (none live at time of writing) before swapping the check
update opportunities set stage = 'evaluation' where stage in ('qualified', 'pilot');

alter table opportunities drop constraint if exists opportunities_stage_check;
alter table opportunities add constraint opportunities_stage_check
  check (stage in ('discovery','erstgespraech','evaluation','proposal','negotiation','won','lost'));
