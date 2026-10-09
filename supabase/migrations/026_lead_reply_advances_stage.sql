-- 026: A reply moves a lead from "Outreach" to "Im Gespräch" (stage 'contacted').
-- Any inbound activity on the lead's company counts: synced or add-on emails,
-- or a reply logged by hand (e.g. LinkedIn message, direction "eingehend").

create or replace function advance_lead_on_reply()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' and new.company_id is not null then
    update leads set stage = 'contacted'
     where company_id = new.company_id
       and stage = 'outreach'
       and converted_to_opportunity_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activities_advance_lead on activities;
create trigger trg_activities_advance_lead
  after insert or update of direction, company_id on activities
  for each row execute function advance_lead_on_reply();
