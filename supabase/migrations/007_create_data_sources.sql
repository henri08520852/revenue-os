-- ============================================================
-- 007: Data Sources (connector registry)
-- ============================================================

create table data_sources (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  slug                        text unique not null,  -- 'career_page' | 'ats_personio' | 'gmail' etc.
  connector_type              text not null,

  -- Availability
  is_global                   bool default true,     -- available to all projects?
  enabled                     bool default true,

  -- Refresh defaults
  default_refresh_hours       int not null default 24,

  -- Cost metadata (for budget-aware processing)
  cost_type                   text default 'free'
                              check (cost_type in ('free','api_key_required','per_request','flat_subscription')),
  estimated_cost_per_1000_eur numeric default 0,

  -- Quality
  reliability_score           int default 80 check (reliability_score between 0 and 100),

  -- Config
  requires_api_key            bool default false,
  config_schema               jsonb,   -- JSON Schema for required subscription config fields

  -- Legal/compliance tracking
  terms_verified_at           timestamptz,
  terms_notes                 text,

  created_at                  timestamptz not null default now()
);

-- ============================================================
-- Seed: Initial data sources
-- ============================================================

insert into data_sources (name, slug, connector_type, is_global, enabled,
  default_refresh_hours, cost_type, estimated_cost_per_1000_eur,
  reliability_score, requires_api_key, terms_notes) values

-- Career page scraper (generic HTTP)
('Career Page (HTTP)', 'career_page_http', 'career_page',
  true, true, 24, 'free', 0, 75, false,
  'Publicly accessible career pages. Check robots.txt per domain. Generally permissible for B2B signal detection.'),

-- ATS-specific adapters (structured feeds — more reliable than generic HTML)
('Personio Career Feed', 'ats_personio', 'career_page',
  true, true, 12, 'free', 0, 90, false,
  'Public Personio job feeds at company.jobs.personio.com/jobs. JSON API. Verify ToS allows commercial signal use.'),

('Lever Job Feed', 'ats_lever', 'career_page',
  true, true, 12, 'free', 0, 92, false,
  'Public Lever job feeds at jobs.lever.co/<company>. JSON API. Generally scrapable.'),

('Greenhouse Job Feed', 'ats_greenhouse', 'career_page',
  true, true, 12, 'free', 0, 92, false,
  'Public Greenhouse job boards. JSON API at boards-api.greenhouse.io. Generally scrapable.'),

('Workable Job Feed', 'ats_workable', 'career_page',
  true, true, 12, 'free', 0, 88, false,
  'Public Workable job boards. JSON API available. Verify ToS.'),

('SmartRecruiters Feed', 'ats_smartrecruiters', 'career_page',
  true, true, 12, 'free', 0, 85, false,
  'Public SmartRecruiters job boards. JSON API at careers.smartrecruiters.com. Verify ToS.'),

-- Generic website monitoring
('Company Website', 'company_website', 'website',
  true, false, 168, 'free', 0, 70, false,
  'General company website scraping. Only collect commercially relevant signals. Check robots.txt.'),

-- Internal sources
('Gmail (OAuth)', 'gmail', 'internal_email',
  true, false, 1, 'free', 0, 95, true,
  'Gmail OAuth. Requires google.cloud project + user authorization. Test mode: 100 users max, tokens expire 7 days. Production: OAuth verification required (2-4 weeks).'),

('Calendar (Google)', 'google_calendar', 'internal_calendar',
  true, false, 1, 'free', 0, 95, true,
  'Google Calendar OAuth. Same OAuth app as Gmail.'),

-- Manual / import sources
('Manual Entry', 'manual', 'manual',
  true, true, 0, 'free', 0, 100, false,
  'Manually entered data. Always trusted.'),

('LinkedIn Network Export', 'linkedin_export', 'import',
  true, true, 0, 'free', 0, 80, false,
  'LinkedIn connections CSV export. ToS: personal use. Do not automate collection. Import once, use as relationship seed.'),

('CSV Import', 'csv_import', 'import',
  true, true, 0, 'free', 0, 90, false,
  'Generic CSV company/contact import.');
