// AI assistant for a contact / company / deal: answers questions and writes briefings
// from the CRM context (lib/ai/context.ts). Streams plain text back to the browser.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getTeamContext } from '@/lib/team'
import { AiTarget, buildContext } from '@/lib/ai/context'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Summaries and Q&A over CRM data – the small model is plenty; override with AI_MODEL if needed
const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5'

const SYSTEM = `Du bist der Vertriebs-Assistent im CRM „Revenue OS“ des Teams von Altoris (Produkt: HireFlow, Recruiting-Software).
Du bekommst den vollständigen CRM-Kontext eines Kontakts, einer Company oder eines Deals: Stammdaten, Aufgaben und den Verlauf mit E-Mails, Notizen, Anrufen, Meetings und Deal-Änderungen.

So arbeitest du:
- Antworte auf Deutsch, knapp und konkret, wie ein erfahrener Kollege im Vertrieb. Lieber kurz als vollständig: keine Füllsätze, keine allgemeinen Ratschläge.
- Stütze dich nur auf den CRM-Kontext. Steht etwas nicht darin, sag das offen, statt zu raten.
- Nenne bei Fakten kurz die Quelle (Datum und Art, z. B. „E-Mail von Anna, 06.10.“).
- „Wir“ ist das Altoris-Team; Absender mit @altoris.one sind Kolleg:innen.
- Formatiere mit kurzen Absätzen, Stichpunkten und ggf. Überschriften (##). Keine Tabellen.`

const BRIEFING_PROMPT = `Erstelle ein kurzes Briefing für das nächste Gespräch. Genau zwei Abschnitte, nichts davor oder danach:

## Zusammenfassung
1–3 Sätze mit dem, was belegt ist: Stand, bisheriger Verlauf, konkrete Fakten (Bedarf, Budget, Timing, Entscheider), soweit sie im Verlauf stehen. Gibt es wenig Verlauf, reicht ein Satz.

## Offene Punkte & Fragen
Nur Punkte, die sich konkret aus dem Verlauf ergeben: unbeantwortete Fragen oder Bitten des Kunden, offene Zusagen (unsere oder seine), fällige Aufgaben. Höchstens 5 Stichpunkte, je eine Zeile, mit Datum oder Person.
Was für das Geschäft wichtig, aber noch unbekannt ist (z. B. Budget, Timing, Entscheider), fasst du in genau einem letzten Stichpunkt zusammen: „Noch unbekannt: …“.

Weglassen: allgemeine Vertriebstipps, Spekulation, Beobachtungen zu E-Mail-Adressen oder zur Datenpflege im CRM. Je weniger im Verlauf steht, desto kürzer das Briefing.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  const { me, denied } = await getTeamContext()
  const { data: { user } } = await (createClient() as any).auth.getUser()
  if (!user || denied || !me) return new Response('Nicht angemeldet', { status: 401 })
  // Own key for the assistant so its spend shows up separately in the Anthropic Console
  const apiKey = process.env.ANTHROPIC_BRIEFING_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response('KI ist noch nicht eingerichtet: ANTHROPIC_BRIEFING_API_KEY fehlt in Vercel.', { status: 503 })

  const body = await req.json().catch(() => null) as { target?: AiTarget; messages?: ChatMessage[]; briefing?: boolean } | null
  const target = body?.target
  if (!target || !['contact', 'company', 'deal'].includes(target.kind) || !target.id) return new Response('Ungültige Anfrage', { status: 400 })

  const history = (body?.messages || [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
  const messages: Anthropic.MessageParam[] = body?.briefing
    ? [{ role: 'user', content: BRIEFING_PROMPT }]
    : history.map(m => ({ role: m.role, content: m.content }))
  if (!messages.length || messages[0].role !== 'user') return new Response('Keine Frage übermittelt', { status: 400 })

  const context = await buildContext(target)
  if (!context) return new Response('Datensatz nicht gefunden', { status: 404 })

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const run = client.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'low' },
          system: [
            { type: 'text', text: SYSTEM },
            // The record context is identical for follow-up questions → cached (~10x cheaper)
            { type: 'text', text: `CRM-Kontext zu „${context.title}“:\n\n${context.text}`, cache_control: { type: 'ephemeral' } },
          ],
          messages,
        })
        run.on('text', delta => controller.enqueue(encoder.encode(delta)))
        const final = await run.finalMessage()
        if (final.stop_reason === 'refusal') controller.enqueue(encoder.encode('\n\n_(Die KI hat diese Anfrage abgelehnt.)_'))
        else if (final.stop_reason === 'max_tokens') controller.enqueue(encoder.encode('\n\n_(Antwort gekürzt.)_'))
      } catch (err) {
        const msg = err instanceof Anthropic.AuthenticationError ? 'API-Key ungültig – bitte ANTHROPIC_BRIEFING_API_KEY in Vercel prüfen.'
          : err instanceof Anthropic.RateLimitError ? 'Gerade zu viele Anfragen – bitte gleich nochmal versuchen.'
          : err instanceof Anthropic.APIError ? `KI-Fehler (${err.status}): ${err.message}`
          : 'KI nicht erreichbar.'
        controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
