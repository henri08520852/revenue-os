-- 023: Email logging — every synced business email with full text, plus a
-- "Posteingang" for emails that could not be matched to a CRM record yet.
--
-- status:  inbox   → not matched, waiting to be assigned (or ignored)
--          matched → logged as activity on company / contact / deal
--          ignored → dismissed from the Posteingang
--
-- Emails are de-duplicated per project by their RFC Message-ID, so a thread that
-- reaches several team mailboxes is stored once.

create table if not exists emails (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  mailbox_user_id  uuid references auth.users(id) on delete set null,
  mailbox_email    text,
  gmail_id         text not null,
  thread_id        text,
  message_id       text not null,
  subject          text,
  from_email       text,
  from_name        text,
  to_emails        text[] not null default '{}',
  cc_emails        text[] not null default '{}',
  sent_at          timestamptz not null,
  direction        text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  snippet          text,
  body_text        text,
  has_attachments  boolean not null default false,
  labelled         boolean not null default false,   -- carried the Gmail label "Revenue OS"
  status           text not null default 'inbox' check (status in ('inbox', 'matched', 'ignored')),
  company_id       uuid references companies(id) on delete set null,
  person_id        uuid references people(id) on delete set null,
  opportunity_id   uuid references opportunities(id) on delete set null,
  activity_id      uuid references activities(id) on delete set null,
  assigned_by      uuid references auth.users(id) on delete set null,
  assigned_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (project_id, message_id)
);

create index if not exists idx_emails_inbox on emails(project_id, status, sent_at desc);
create index if not exists idx_emails_thread on emails(mailbox_user_id, thread_id);
create index if not exists idx_emails_company on emails(company_id);
create index if not exists idx_emails_person on emails(person_id);
create index if not exists idx_emails_from on emails(project_id, from_email);

-- Full email content: only team members of the project can read or change it.
-- The Gmail sync writes with the service role (bypasses RLS).
alter table emails enable row level security;
revoke all on emails from anon;

drop policy if exists emails_member_read on emails;
create policy emails_member_read on emails
  for select to authenticated
  using (exists (select 1 from project_members m where m.project_id = emails.project_id and m.user_id = auth.uid()));

drop policy if exists emails_member_update on emails;
create policy emails_member_update on emails
  for update to authenticated
  using (exists (select 1 from project_members m where m.project_id = emails.project_id and m.user_id = auth.uid()))
  with check (exists (select 1 from project_members m where m.project_id = emails.project_id and m.user_id = auth.uid()));
