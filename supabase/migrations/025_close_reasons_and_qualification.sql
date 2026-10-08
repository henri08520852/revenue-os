-- 025: Win/loss reasons on deals + a slim qualification checklist on leads and deals.
--
-- qualification (jsonb), one entry per criterion:
--   { "pain":      { "status": "yes" | "unknown" | "no", "note": "…" },
--     "budget":    { … }, "decision_maker": { … }, "timing": { … }, "champion": { … } }
-- Converting a lead copies its checklist into the new deal (app code).

alter table opportunities add column if not exists close_reason     text;
alter table opportunities add column if not exists close_competitor text;
alter table opportunities add column if not exists close_note       text;
alter table opportunities add column if not exists qualification   jsonb not null default '{}'::jsonb;

alter table leads add column if not exists qualification jsonb not null default '{}'::jsonb;
