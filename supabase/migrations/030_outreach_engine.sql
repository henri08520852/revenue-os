-- ============================================================
-- 030: Outreach engine
--   * Lead stage 'prospect' before 'outreach': chosen to be contacted, nothing sent yet.
--     The first outbound activity (LinkedIn message, email, letter) moves it to 'outreach'.
--   * Personalisation fields on leads (persona, playbook, variant, signal, score) and people (persona)
--   * first_contacted_at / replied_at for reply rates
--   * outreach_stats: sent / replies per persona, playbook, variant and signal
-- Idempotent.
-- ============================================================

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('prospect','outreach','contacted','qualified','converted','disqualified'));

alter table leads add column if not exists persona               text;
alter table leads add column if not exists playbook_key          text;
alter table leads add column if not exists variant               text;
alter table leads add column if not exists signal_used           text;
alter table leads add column if not exists personalization_score int check (personalization_score between 0 and 100);
alter table leads add column if not exists li_status             text not null default 'none'
  check (li_status in ('none','requested','connected','messaged'));
alter table leads add column if not exists first_contacted_at    timestamptz;
alter table leads add column if not exists replied_at            timestamptz;

alter table people add column if not exists persona        text;
alter table people add column if not exists persona_source text check (persona_source in ('rule','manual'));

-- Company status follows real contact:
--   target (nothing sent, also prospects) → outreach (written, no reply) → warm (replied) → hot → customer
alter table companies drop constraint if exists companies_account_status_check;
alter table companies add constraint companies_account_status_check
  check (account_status in ('target','outreach','warm','hot','active_deal','customer','inactive'));

create or replace function derive_company_account_status(p_company_id uuid)
returns text language sql stable as $$
  select case
    when exists (select 1 from opportunities o
                 where o.company_id = p_company_id and o.stage = 'won') then 'customer'
    when exists (select 1 from opportunities o
                 where o.company_id = p_company_id and o.stage not in ('won','lost')) then 'hot'
    when exists (select 1 from leads l
                 where l.company_id = p_company_id and l.stage in ('contacted','qualified','converted')) then 'warm'
    when exists (select 1 from leads l
                 where l.company_id = p_company_id and l.stage = 'outreach') then 'outreach'
    else 'target'
  end;
$$;

-- Activities drive the lead: outbound = contacted for the first time, inbound = reply
create or replace function advance_lead_on_reply()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.company_id is null then return new; end if;
  if new.direction = 'inbound' then
    update leads set stage = 'contacted',
                     replied_at = coalesce(replied_at, new.occurred_at),
                     first_contacted_at = coalesce(first_contacted_at, new.occurred_at)
     where company_id = new.company_id
       and stage in ('prospect','outreach')
       and converted_to_opportunity_id is null;
  elsif new.direction = 'outbound' then
    update leads set stage = case when stage = 'prospect' then 'outreach' else stage end,
                     first_contacted_at = coalesce(first_contacted_at, new.occurred_at),
                     li_status = case when coalesce(new.channel, '') like 'linkedin%' then 'messaged' else li_status end
     where company_id = new.company_id
       and stage in ('prospect','outreach')
       and converted_to_opportunity_id is null;
  end if;
  return new;
end;
$$;

-- Moved by hand from prospect to a later stage → count it as contacted now
create or replace function lead_contact_dates()
returns trigger language plpgsql as $$
begin
  if new.stage <> 'prospect' and new.stage <> 'disqualified' and new.first_contacted_at is null
     and (tg_op = 'INSERT' or old.stage = 'prospect') then
    new.first_contacted_at := now();
  end if;
  if new.stage in ('contacted','qualified','converted') and new.replied_at is null
     and (tg_op = 'INSERT' or old.stage in ('prospect','outreach')) then
    new.replied_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_leads_contact_dates on leads;
create trigger trg_leads_contact_dates
  before insert or update of stage on leads
  for each row execute function lead_contact_dates();

-- Backfill contact dates from the timeline
update leads l set first_contacted_at = a.first_out
  from (select company_id, min(occurred_at) first_out from activities where direction = 'outbound' group by company_id) a
 where a.company_id = l.company_id and l.first_contacted_at is null;
update leads l set replied_at = a.first_in
  from (select company_id, min(occurred_at) first_in from activities where direction = 'inbound' group by company_id) a
 where a.company_id = l.company_id and l.replied_at is null and l.stage in ('contacted','qualified','converted');

create index if not exists idx_leads_outreach_stats on leads(project_id, first_contacted_at) where first_contacted_at is not null;

-- What works: contacted leads grouped by persona / playbook / variant / signal
create or replace view outreach_stats with (security_invoker = true) as
select project_id,
       coalesce(persona, 'unbekannt')      as persona,
       coalesce(playbook_key, 'ohne')      as playbook_key,
       coalesce(variant, '-')              as variant,
       coalesce(signal_used, 'ohne')       as signal_used,
       count(*)                            as sent,
       count(replied_at)                   as replies,
       count(*) filter (where stage in ('qualified','converted')) as qualified,
       round(avg(personalization_score))   as avg_score,
       max(first_contacted_at)             as last_sent_at
  from leads
 where first_contacted_at is not null
 group by 1, 2, 3, 4, 5;

revoke all on outreach_stats from anon;
grant select on outreach_stats to authenticated;

-- Company status after the new rule
select refresh_company_account_status(c.id) from companies c
 where exists (select 1 from leads l where l.company_id = c.id);
