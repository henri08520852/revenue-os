-- ============================================================
-- 019: Company status flow
--   target → warm (lead exists) → hot (open deal) → customer (deal won)
-- Derived by triggers on leads + opportunities, so every write path
-- (UI, lead conversion, pipeline, cron) keeps the status in sync.
-- 'inactive' is manual: it is only left when a lead or deal appears.
-- ============================================================

-- active_deal and hot meant the same thing; hot is the canonical value now
-- (active_deal stays allowed by the check for older code paths)
update companies set account_status = 'hot' where account_status = 'active_deal';

create or replace function derive_company_account_status(p_company_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from opportunities o
                 where o.company_id = p_company_id and o.stage = 'won') then 'customer'
    when exists (select 1 from opportunities o
                 where o.company_id = p_company_id and o.stage not in ('won','lost')) then 'hot'
    -- converted leads count: after a lost deal the account falls back to warm
    when exists (select 1 from leads l
                 where l.company_id = p_company_id and l.stage <> 'disqualified') then 'warm'
    else 'target'
  end;
$$;

create or replace function refresh_company_account_status(p_company_id uuid)
returns void language plpgsql as $$
declare
  v_new text;
begin
  if p_company_id is null then return; end if;
  v_new := derive_company_account_status(p_company_id);
  update companies
     set account_status = v_new
   where id = p_company_id
     and account_status is distinct from v_new
     -- don't pull a manually deactivated account back to target
     and not (account_status = 'inactive' and v_new = 'target');
end $$;

create or replace function trg_refresh_company_status()
returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform refresh_company_account_status(old.company_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id
                                       or new.stage is distinct from old.stage) then
    perform refresh_company_account_status(new.company_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_leads_company_status on leads;
create trigger trg_leads_company_status
  after insert or update of stage, company_id or delete on leads
  for each row execute function trg_refresh_company_status();

drop trigger if exists trg_opportunities_company_status on opportunities;
create trigger trg_opportunities_company_status
  after insert or update of stage, company_id or delete on opportunities
  for each row execute function trg_refresh_company_status();

-- Backfill: only accounts that already have a lead or deal
-- (manually set statuses on untouched accounts are left alone)
select refresh_company_account_status(c.id)
from companies c
where exists (select 1 from leads l where l.company_id = c.id)
   or exists (select 1 from opportunities o where o.company_id = c.id);
