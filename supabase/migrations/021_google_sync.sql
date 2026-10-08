-- ============================================================
-- 021: Google (Gmail + Calendar) sync
-- ============================================================

-- One Google connection per user. Holds OAuth tokens → RLS ON with NO
-- policies: only the service role (server-side sync) can read or write it.
create table if not exists google_connections (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  project_id               uuid not null references projects(id) on delete cascade,
  google_email             text not null,
  refresh_token            text not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  scopes                   text,
  gmail_last_synced_at     timestamptz,
  calendar_last_synced_at  timestamptz,
  last_error               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table google_connections enable row level security;
revoke all on google_connections from anon, authenticated;

drop trigger if exists trg_google_connections_updated_at on google_connections;
create trigger trg_google_connections_updated_at
  before update on google_connections
  for each row execute function update_updated_at();

-- Team calendar: events of every connected member (window: -30 / +60 days).
-- Readable by signed-in users only, written by the sync (service role).
create table if not exists calendar_events (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  google_event_id  text not null,
  title            text,
  start_at         timestamptz not null,
  end_at           timestamptz,
  all_day          boolean not null default false,
  location         text,
  meet_link        text,
  html_link        text,
  organizer_email  text,
  attendees        jsonb not null default '[]',
  company_id       uuid references companies(id) on delete set null,
  person_id        uuid references people(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (user_id, google_event_id)
);
create index if not exists idx_calendar_events_range on calendar_events(project_id, start_at);
create index if not exists idx_calendar_events_company on calendar_events(company_id);

alter table calendar_events enable row level security;
revoke all on calendar_events from anon;
drop policy if exists calendar_events_read on calendar_events;
create policy calendar_events_read on calendar_events
  for select to authenticated using (true);

-- Synced emails / meetings are de-duplicated by their external id
-- (RFC Message-ID or calendar iCalUID), also across team mailboxes.
create unique index if not exists idx_activities_external_ref
  on activities(project_id, source, raw_reference)
  where raw_reference is not null and source in ('gmail', 'calendar');
