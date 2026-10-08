// Suggests the qualification checklist for a lead or deal from its CRM history.
// The user reviews the suggestion before saving.
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { buildContext, AiTarget } from '@/lib/ai/context'
import { QUALI_CRITERIA, cleanQualification } from '@/lib/dealMeta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5'

const criterion = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['yes', 'unknown', 'no'] },
    note: { type: 'string' },
  },
  required: ['status', 'note'],
  additionalProperties: false,
}
const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(QUALI_CRITERIA.map(c => [c.key, criterion])),
  required: QUALI_CRITERIA.map(c => c.key),
  additionalProperties: false,
}

const PROMPT = `Bewerte die Qualifizierung dieser Verkaufschance anhand des CRM-Verlaufs. Für jedes Kriterium:
- status "yes", wenn der Verlauf es klar belegt; "no", wenn er klar dagegen spricht; sonst "unknown".
- note: ein kurzer Beleg mit Quelle (z. B. „Notiz 07.10.: Budget für Q1 freigegeben“), max. 15 Wörter. Bei "unknown" leer lassen.

Kriterien:
${QUALI_CRITERIA.map(c => `- ${c.key}: ${c.label} – ${c.hint}`).join('\n')}
Für decision_maker und champion zählen auch die Rollen im Buying Center.`

export async function POST(req: Request) {
  const { me, denied } = await getTeamContext()
  if (!me || denied) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  const apiKey = process.env.ANTHROPIC_BRIEFING_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'KI ist noch nicht eingerichtet (API-Key fehlt).' }, { status: 503 })

  const body = await req.json().catch(() => null) as { kind?: 'lead' | 'deal'; id?: string } | null
  if (!body?.id || !['lead', 'deal'].includes(body.kind ?? '')) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })

  // A lead has no own history – its company carries the emails, notes and meetings
  let target: AiTarget = { kind: 'deal', id: body.id }
  if (body.kind === 'lead') {
    const { data: lead } = await (createClient() as any).from('leads').select('company_id').eq('id', body.id).single()
    if (!lead?.company_id) return NextResponse.json({ error: 'Lead ohne Company' }, { status: 400 })
    target = { kind: 'company', id: lead.company_id }
  }
  const context = await buildContext(target)
  if (!context) return NextResponse.json({ error: 'Datensatz nicht gefunden' }, { status: 404 })

  try {
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: `Du bist Vertriebs-Assistent im CRM des Altoris-Teams. Antworte nur mit den Daten aus dem CRM-Kontext.\n\nCRM-Kontext zu „${context.title}“:\n\n${context.text}`,
      messages: [{ role: 'user', content: PROMPT }],
    })
    if (res.stop_reason === 'refusal') return NextResponse.json({ error: 'Die KI hat die Anfrage abgelehnt.' }, { status: 422 })
    const text = res.content.find(b => b.type === 'text')
    const parsed = text && text.type === 'text' ? JSON.parse(text.text) : null
    return NextResponse.json({ qualification: cleanQualification(parsed) })
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `KI-Fehler (${err.status})` : err instanceof SyntaxError ? 'KI-Antwort unlesbar' : 'KI nicht erreichbar'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
