'use server'
import { createClient } from '@/lib/supabase/server'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export type SearchItem = { id: string; kind: 'company' | 'person' | 'deal' | 'lead'; label: string; sub: string | null; href: string }

// Everything the ⌘K menu can jump to (loaded once when it opens; RLS limits it to the team)
export async function getSearchIndex(): Promise<SearchItem[]> {
  const supabase = createClient() as any
  const [{ data: companies }, { data: people }, { data: deals }, { data: leads }] = await Promise.all([
    supabase.from('companies').select('id, name, domain').eq('project_id', PROJECT_ID).order('name').limit(2000),
    supabase.from('people').select('id, full_name, job_title, company:companies(name)').eq('project_id', PROJECT_ID).limit(3000),
    supabase.from('opportunities').select('id, name, stage, company:companies(name)').eq('project_id', PROJECT_ID).limit(1000),
    supabase.from('leads').select('id, name, stage, company:companies(name)').eq('project_id', PROJECT_ID).not('stage', 'in', '(converted)').limit(1000),
  ])
  return [
    ...(companies || []).map((c: any) => ({ id: c.id, kind: 'company' as const, label: c.name, sub: c.domain, href: `/companies/${c.id}` })),
    ...(people || []).map((p: any) => ({ id: p.id, kind: 'person' as const, label: p.full_name || 'Kontakt', sub: [p.job_title, p.company?.name].filter(Boolean).join(' · ') || null, href: `/contacts/${p.id}` })),
    ...(deals || []).map((d: any) => ({ id: d.id, kind: 'deal' as const, label: d.name || d.company?.name || 'Deal', sub: d.company?.name ?? null, href: `/opportunities/${d.id}` })),
    ...(leads || []).map((l: any) => ({ id: l.id, kind: 'lead' as const, label: l.name || l.company?.name || 'Lead', sub: l.company?.name ?? null, href: `/pipeline?focus=${l.id}` })),
  ]
}
