# Revenue OS — Setup Guide

## Voraussetzungen

- Node.js 18+
- Supabase account + neues Projekt
- Vercel account (für Deployment)

---

## 1. Supabase einrichten

### Datenbank-Migrations ausführen

Im Supabase-Dashboard → SQL Editor, folgende Migrations in Reihenfolge ausführen:

```
supabase/migrations/001_create_projects.sql
supabase/migrations/002_create_companies.sql
supabase/migrations/003_create_people.sql
supabase/migrations/004_create_relationships.sql
supabase/migrations/005_create_opportunities.sql
supabase/migrations/006_create_activities.sql
supabase/migrations/007_create_data_sources.sql
supabase/migrations/008_create_source_subscriptions.sql
supabase/migrations/009_create_observations.sql
supabase/migrations/010_create_jobs.sql
supabase/migrations/011_create_signals.sql
supabase/migrations/012_create_actions.sql
supabase/migrations/013_create_connector_runs.sql
```

### pg_cron aktivieren (für automatischen Queue-Run)

Im SQL Editor ausführen:

```sql
-- pg_cron extension aktivieren (nur einmal)
create extension if not exists pg_cron;

-- Cron-Job für Queue-Runner (alle 15 Minuten)
select cron.schedule(
  'process-queue',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://DEINE-VERCEL-URL.vercel.app/api/cron/process-queue',
    headers := '{"Authorization": "Bearer DEIN-CRON-SECRET"}'::jsonb
  );
  $$
);
```

### Erstes Projekt anlegen

```sql
insert into projects (name, slug, config) values (
  'Hireflow DACH',
  'hireflow',
  '{
    "icp": {
      "regions": ["DACH"],
      "employee_range": [10, 500],
      "industries": ["Tech", "SaaS", "Scale-up"],
      "ats_types": ["personio", "lever", "greenhouse"]
    },
    "signal_weights": {
      "hiring_acceleration": 25,
      "commercial_hiring": 20,
      "recruiter_vacancy": 20,
      "repeated_role": 15,
      "new_head_of_people": 20
    },
    "scoring": {
      "hiring_acceleration_threshold_pct": 40,
      "hiring_acceleration_threshold_abs": 4,
      "hiring_acceleration_window_days": 14,
      "repeated_role_min_count": 3,
      "commercial_role_min_count": 2,
      "recruiter_role_min_count": 1
    }
  }'
);
```

Notiere dir die `id` des neuen Projekts (UUID) — du brauchst sie als `NEXT_PUBLIC_DEFAULT_PROJECT_ID`.

---

## 2. Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# Umgebungsvariablen kopieren
cp .env.example .env.local

# .env.local ausfüllen:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - CRON_SECRET (generiere mit: openssl rand -hex 32)
# - NEXT_PUBLIC_DEFAULT_PROJECT_ID (die UUID aus Schritt 1)

# Dev server starten
npm run dev
```

Öffne http://localhost:3000

---

## 3. Vercel Deployment

```bash
# Vercel CLI installieren (einmalig)
npm i -g vercel

# Deployen
vercel

# Environment Variables in Vercel setzen:
# vercel env add SUPABASE_SERVICE_ROLE_KEY
# vercel env add CRON_SECRET
# etc.
```

**Wichtig:** Vercel Cron funktioniert nur auf dem Pro-Plan oder bei Hobby mit maximal 1x täglich.
Alternative: pg_cron direkt (siehe oben) — kein Vercel Pro nötig.

---

## 4. Erste Unternehmen hinzufügen

Im Dashboard → Companies → "+ Unternehmen" oder direkt in Supabase:

```sql
insert into companies (project_id, name, domain, account_status)
values
  ('DEINE-PROJECT-ID', 'Personio', 'personio.com', 'target'),
  ('DEINE-PROJECT-ID', 'Factorial HR', 'factorialhr.com', 'target'),
  ('DEINE-PROJECT-ID', 'Kenjo', 'kenjo.io', 'warm');
```

Dann "⚡ Run Queue" im Dashboard klicken — der Connector entdeckt ATS-Typen und scrapt die ersten Jobs.

---

## 5. Source Subscriptions anlegen

Pro Unternehmen braucht ihr eine Subscription:

```sql
-- Sucht den 'career_page_http' data_source slug
select id from data_sources where slug = 'career_page_http';

-- Subscription anlegen (für alle Companies eines Projekts)
insert into source_subscriptions (project_id, company_id, data_source_id, enabled, next_check_at)
select
  c.project_id,
  c.id,
  (select id from data_sources where slug = 'career_page_http'),
  true,
  now()
from companies c
where c.project_id = 'DEINE-PROJECT-ID';
```

---

## Kosten-Übersicht (1.000 Unternehmen)

| Posten            | Monatlich |
|-------------------|-----------|
| Vercel Pro        | ~€20      |
| Supabase Pro      | ~€25      |
| Claude API        | <€5 (nur hot accounts) |
| **Gesamt**        | **~€50**  |

Kein externes Job-Scraping-API nötig — alles läuft direkt auf die Unternehmenswebseiten.
