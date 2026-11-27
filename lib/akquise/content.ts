// Akquise mode: Simon's message logic from the Content Studio (Marketing-PR-Agent, PR #3/#4), ported 1:1 in content.
// Pure data + helpers, safe for client components. Everything here is editable under Nachrichten → Einstellungen
// (stored in automation_settings, agent_key 'akquise'); these are the defaults.

export type Author = 'henri' | 'simon'
export type Channel = 'connect' | 'dm' | 'email' | 'followup'
export type Rel = 'cold' | 'lukewarm' | 'warm'
export type Offer = 'deepcheck' | 'altoris' | 'hireflow' | 'none'
export type SalesGoal = 'call' | 'reply' | 'trial' | 'referral'
export type Address = 'auto' | 'sie' | 'du'
export type Directive = 'shorter' | 'personal' | 'lesssales' | 'direct'

export const ALTORIS_CTX = `Altoris ist die Beratung von Henri Steckhan und Simon Kurdziel für Unternehmen im DACH-Raum, die nicht so vorankommen wie geplant und nicht genau benennen können, woran es liegt.
Drei Säulen: People & Organisation, Prozesse & Steuerung, Tech & Intelligence. Haltung: Klarheit und Fundament, hands-on statt Foliensätze.
Einstieg: der Deep Check. KI-geführte Interviews mit Führung und Schlüsselpersonen, übergreifende Auswertung, Abschluss-Workshop; dauert 5 bis 10 Tage. Danach optional Rebuild, also Begleitung der Umsetzung.
Zielgruppen: wachsender Mittelstand, Scale-ups und Start-ups, Konzern-Einheiten und Carve-outs. Nicht: akute Krise oder Sanierung.
Eigenes Werkzeug in der Tech-Säule: Hireflow, eine B2B-Hiring-Plattform mit KI-gestützten Erstinterviews und strukturierter Auswertung.`

export type SalesPerson = { full: string; first: string; email: string; voice: string }

export const SALES_PEOPLE: Record<Author, SalesPerson> = {
  henri: {
    full: 'Henri Steckhan', first: 'Henri', email: 'henri.steckhan@altoris.one',
    voice: `Du schreibst als Henri Steckhan, Co-Founder von Altoris.
HINTERGRUND (nur nutzen, wenn es zur Nachricht passt; nie als Lebenslauf aufzählen): Corporate Development, M&A und Restrukturierung. Board-, Integrations- und Reorganisationsthemen hat er von innen erlebt.
WIE HENRI SCHREIBT: analytisch, ruhig, präzise, eher kurz. Er benennt ein strukturelles Muster statt Symptome. Auf Augenhöhe mit Geschäftsführung, CFO und Bereichsleitung, nie wie ein Vertriebler. Keine Begeisterungsformeln. Typische Bewegung: konkrete Beobachtung, dann eine Hypothese, dann eine offene Frage. Er darf eine leicht unbequeme These andeuten und bleibt dabei respektvoll.`,
  },
  simon: {
    full: 'Simon Kurdziel', first: 'Simon', email: 'simon.kurdziel@altoris.one',
    voice: `Du schreibst als Simon Kurdziel, Co-Founder von Altoris.
HINTERGRUND (nur nutzen, wenn es zur Nachricht passt; nie als Lebenslauf aufzählen): HR und Talent Acquisition. Er hat in einer Holding mit mehreren Gesellschaften HR-Strukturen von Grund auf aufgebaut und Personio als Product Owner über mehrere Gesellschaften ausgerollt. Sehr viele Recruiting- und Führungsgespräche geführt.
WIE SIMON SCHREIBT: menschlich, direkt, warm ohne Floskeln, nahbar und konkret. Lieber eine kurze echte Beobachtung aus der Praxis als eine abstrakte These. Klingt wie ein Kollege, der das Problem selbst schon gelöst hat, nicht wie ein Berater. Unaufgeregt, nie belehrend.`,
  },
}

export const SALES_RULES = `REGELN FÜR JEDE NACHRICHT:
- Der erste Satz handelt vom Empfänger oder seiner Situation, nicht von uns. Nicht mit „Ich" beginnen.
- Nutze ausschließlich Fakten über den Empfänger, die im Kontext stehen. Erfinde nichts: keine Posts, keine Erfolge, keine gemeinsamen Bekannten, keine Zahlen.
- Höchstens ein bis zwei Sätze darüber, was wir tun, in Alltagssprache ohne Beraterdeutsch.
- Genau ein Call-to-Action, leicht zu beantworten. Kein Druck, keine künstliche Dringlichkeit.
- Keine Preise, keine Erfolgsversprechen, keine Superlative.
- Verbotene Floskeln: „Ich hoffe, es geht Ihnen gut", „Ich bin auf Ihr Profil gestoßen", „kurze Frage", „Synergien", „Mehrwert", „Win-win", „unverbindlich", „virtueller Kaffee", „Ich wollte nur nachhaken", „spannend" als Füllwort.
- Keine Gedankenstriche (– oder —). Bindestriche in Wörtern sind in Ordnung. Nutze Punkt, Komma oder Doppelpunkt.
- Keine Emojis, keine Ausrufezeichen, keine Hashtags.
- Deutsch, natürliche Satzlänge, so wie man wirklich schreibt. Lieber zu kurz als zu lang.
- Anrede nie mit Vor- und Nachname zusammen, nie „Guten Tag Vorname Nachname".
- Grußformel auf LinkedIn: „Viele Grüße" und Vorname. In E-Mails mit Signatur (Vorname Nachname, Co-Founder Altoris, altoris.one).`

export const CHANNELS: Record<Channel, { label: string; soft: number; hard: number; spec: string }> = {
  connect: { label: 'LinkedIn · Vernetzung', soft: 200, hard: 300,
    spec: 'Vernetzungsanfrage. Hartes Limit 300 Zeichen inklusive Leerzeichen, Ziel unter 200 Zeichen (ohne LinkedIn Premium ist bei 200 Schluss). Kein Pitch, kein Link, keine Terminfrage. Nur: warum gerade diese Person, ein echter Anknüpfungspunkt. Am Ende nur der Vorname.' },
  dm: { label: 'LinkedIn · Nachricht', soft: 750, hard: 1300,
    spec: 'Direktnachricht auf LinkedIn. 400 bis 700 Zeichen, kurze Absätze, auf dem Handy gut lesbar. Genau eine Frage am Ende.' },
  email: { label: 'E-Mail', soft: 1100, hard: 1600,
    spec: 'E-Mail. Betreff mit höchstens 6 Wörtern, konkret, keine Clickbait-Frage. Text 70 bis 140 Wörter. Mit Signatur.' },
  followup: { label: 'Follow-up', soft: 450, hard: 700,
    spec: 'Follow-up auf eine frühere Nachricht, auf die keine Antwort kam. 200 bis 450 Zeichen. Kurz darauf beziehen, aber einen neuen Gedanken oder Nutzen bringen. Kein „wollte nur nachhaken", kein Vorwurf, kein Druck.' },
}

export const RELS: Record<Rel, { label: string; hint: string; spec: string }> = {
  cold: { label: 'Kalt', hint: 'kennt uns nicht', spec: 'Der Empfänger kennt uns nicht. Respektvoll und knapp, der erste Satz handelt von ihm. In einem Halbsatz begründen, warum gerade er. Keine falsche Vertrautheit.' },
  lukewarm: { label: 'Lauwarm', hint: 'es gibt einen Bezug', spec: 'Es gibt einen Bezug (gemeinsamer Kontakt, Veranstaltung, Reaktion auf einen Post). Diesen Bezug gleich am Anfang konkret nennen, aber nur, wenn er im Kontext steht.' },
  warm: { label: 'Warm', hint: 'kennt mich persönlich', spec: 'Der Empfänger kennt den Absender persönlich. Locker und ehrlich wie unter Bekannten, kein Vertriebston. Offen sagen, was wir gerade aufbauen, und eher um Einschätzung oder Rat bitten als zu verkaufen.' },
}

export const OFFERS: Record<Offer, { label: string; angle: string }> = {
  deepcheck: { label: 'Altoris · Deep Check', angle: 'Der Deep Check als konkreter, überschaubarer Einstieg: In 5 bis 10 Tagen sprechen wir KI-gestützt mit Führung und Schlüsselpersonen, werten übergreifend aus und zeigen im Abschluss-Workshop, woran es wirklich hakt. Nicht als Produkt pitchen, sondern als Antwort auf ein Problem, das der Empfänger plausibel hat.' },
  altoris: { label: 'Altoris · Austausch', angle: 'Altoris allgemein. Ziel ist ein ehrlicher Austausch auf Augenhöhe über die Situation des Empfängers, kein Verkaufsgespräch.' },
  hireflow: { label: 'Hireflow', angle: 'Hireflow: KI-gestützte Erstinterviews per Screening-Link mit strukturierter Auswertung und klarer Empfehlung, damit Hiring-Teams früher sehen, wie Kandidaten denken und kommunizieren. Einstieg über den kostenlosen Plan möglich.' },
  none: { label: 'Ohne Angebot', angle: 'Kein Angebot erwähnen. Ziel ist reine Beziehungspflege mit einem echten Anknüpfungspunkt. Altoris höchstens in der Signatur.' },
}

export const SALES_GOALS: Record<SalesGoal, { label: string; spec: string }> = {
  call: { label: 'Kurzes Gespräch', spec: 'Ein kurzes Gespräch von etwa 20 Minuten vorschlagen, ohne Termine zu diktieren. Leichtes Ja ermöglichen.' },
  reply: { label: 'Antwort anstoßen', spec: 'Eine echte, leicht zu beantwortende Frage stellen, die zum Nachdenken anregt. Noch kein Termin.' },
  trial: { label: 'Hireflow testen', spec: 'Zum kostenlosen Ausprobieren von Hireflow einladen, ohne Druck.' },
  referral: { label: 'Weiterverweis', spec: 'Fragen, wer im Unternehmen der richtige Ansprechpartner für das Thema ist, falls es nicht der Empfänger selbst ist.' },
}

// Simon's auto rule was "Sie for cold/lukewarm in classic Mittelstand and corporates". Henri's rule (Nov 2026): du by default.
export const ADDRESS: Record<Address, string> = {
  auto: 'Duzen ist bei uns Standard. Siezen nur, wenn der Kontext klar auf ein förmliches Umfeld hindeutet (z. B. Konzern-Vorstand, Behörde) oder der Empfänger selbst siezt.',
  sie: 'Siezen.',
  du: 'Duzen.',
}

export const DIRECTIVES: Record<Directive, { label: string; spec: string }> = {
  shorter: { label: 'Kürzer', spec: 'Kürze die Nachricht um etwa ein Drittel. Anknüpfungspunkt und Abschluss bleiben.' },
  personal: { label: 'Persönlicher', spec: 'Mach die Nachricht persönlicher und konkreter auf den Empfänger bezogen, ausschließlich mit Fakten aus dem Kontext. Erfinde nichts.' },
  lesssales: { label: 'Weniger Vertrieb', spec: 'Nimm jeden Verkaufston heraus. Es soll klingen wie eine Nachricht unter Kollegen, das Angebot tritt in den Hintergrund.' },
  direct: { label: 'Direkter', spec: 'Mach die Nachricht direkter: sag früher und klarer, worum es geht und was du dir wünschst.' },
}

export const FLOSKELN = ['ich hoffe, es geht', 'ich hoffe es geht', 'auf ihr profil gestoßen', 'auf dein profil gestoßen', 'kurze frage', 'synergie', 'mehrwert', 'win-win', 'unverbindlich', 'virtuellen kaffee', 'virtueller kaffee', 'game changer', 'game-changer', 'wollte nur', 'nachhaken', 'spannend']

// ---------- editable settings (agent_key 'akquise') ----------

export type AkquiseConfig = {
  context: string
  rules: string
  voices: Record<Author, SalesPerson>
  offers: Record<Offer, string>
  addressAuto: string
  floskeln: string[]
}

export const AKQUISE_DEFAULTS: AkquiseConfig = {
  context: ALTORIS_CTX,
  rules: SALES_RULES,
  voices: SALES_PEOPLE,
  offers: Object.fromEntries(Object.entries(OFFERS).map(([k, v]) => [k, v.angle])) as Record<Offer, string>,
  addressAuto: ADDRESS.auto,
  floskeln: FLOSKELN,
}

export function mergeAkquise(saved: any): AkquiseConfig {
  const s = saved && typeof saved === 'object' ? saved : {}
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v : d)
  return {
    context: str(s.context, AKQUISE_DEFAULTS.context),
    rules: str(s.rules, AKQUISE_DEFAULTS.rules),
    voices: Object.fromEntries((['henri', 'simon'] as Author[]).map(a => {
      const d = SALES_PEOPLE[a], v = s.voices?.[a] || {}
      return [a, { full: str(v.full, d.full), first: str(v.first, d.first), email: str(v.email, d.email), voice: str(v.voice, d.voice) }]
    })) as Record<Author, SalesPerson>,
    offers: Object.fromEntries((Object.keys(OFFERS) as Offer[]).map(k => [k, str(s.offers?.[k], OFFERS[k].angle)])) as Record<Offer, string>,
    addressAuto: str(s.addressAuto, ADDRESS.auto),
    floskeln: Array.isArray(s.floskeln) && s.floskeln.length ? s.floskeln.map((x: unknown) => String(x).toLowerCase().trim()).filter(Boolean) : FLOSKELN,
  }
}

// ---------- quality check (Simon's salesLint) ----------

export type LintChip = { tone: 'ok' | 'warn' | 'fail'; text: string }
const words = (t: string) => (t.trim().match(/\S+/g) || []).length

export function lint(text: string, channel: Channel, subject?: string | null, floskeln: string[] = FLOSKELN): LintChip[] {
  const t = text || ''
  const ch = CHANNELS[channel] || CHANNELS.dm
  const n = t.length
  const out: LintChip[] = []
  if (channel === 'connect') {
    if (n > ch.hard) out.push({ tone: 'fail', text: `${n}/300 Zeichen, zu lang` })
    else if (n > ch.soft) out.push({ tone: 'warn', text: `${n} Zeichen, ohne Premium max. 200` })
    else out.push({ tone: 'ok', text: `${n} Zeichen` })
  } else if (channel === 'email') {
    const w = words(t)
    out.push({ tone: w > 170 ? 'warn' : 'ok', text: `${w} Wörter${w > 170 ? ', eher kürzen' : ''}` })
    if (subject != null && words(subject) > 7) out.push({ tone: 'warn', text: 'Betreff zu lang' })
  } else {
    out.push({ tone: n > ch.soft ? 'warn' : 'ok', text: `${n} Zeichen${n > ch.soft ? ', eher kürzen' : ''}` })
  }
  const low = t.toLowerCase()
  const fl = floskeln.filter(f => low.includes(f))
  if (fl.length) out.push({ tone: 'fail', text: `Floskel: ${fl.slice(0, 3).join(', ')}` })
  if (/[–—]/.test(t)) out.push({ tone: 'fail', text: 'Gedankenstrich' })
  const opening = t.trim().replace(/^[^\n]{0,70},[ \t]*\n+/, '') // skip the salutation line
  if (/^ich\b/i.test(opening)) out.push({ tone: 'warn', text: 'Beginnt mit „Ich"' })
  const q = (t.match(/\?/g) || []).length
  if (channel !== 'connect' && q === 0) out.push({ tone: 'warn', text: 'Keine Frage, kein klarer Abschluss' })
  if (q > 2) out.push({ tone: 'warn', text: `${q} Fragen, besser eine` })
  if ((t.match(/!/g) || []).length) out.push({ tone: 'warn', text: 'Ausrufezeichen' })
  if (/\d+\s?(€|euro|eur)\b|preis/i.test(t)) out.push({ tone: 'warn', text: 'Preis erwähnt' })
  if (!fl.length && !/[–—]/.test(t)) out.push({ tone: 'ok', text: 'Keine Floskeln' })
  return out
}

// ---------- draft shape (content_drafts.payload, same as the Content Studio so both can open it) ----------

export type SalesForm = {
  offer: Offer; channel: Channel; rel: Rel; address: Address; goal: SalesGoal
  name: string; role: string; company: string; context: string; prev: string; sequence: boolean
}
export type SalesText = { label: string; subject: string; text: string }
export type HistoryEvent = { at: string; by: string; action: 'created' | 'regenerated' | 'refined' | 'edited' | 'chosen' | 'sent' | 'archived' | 'restored'; detail?: string }
export type SalesPayload = {
  form: SalesForm; author: Author
  variants: SalesText[]; followups: SalesText[]; rationale: string; chosen: number; sampleCount: number
  // Revenue OS additions (the Content Studio ignores them)
  crm?: { person_id: string | null; company_id: string | null; lead_id: string | null; create?: boolean }
  extra?: { draftText?: string; pains?: string[]; useCrm?: boolean; hireflow?: { persona?: string; playbook?: string; pain?: string | null; evidence?: string | null; baseText?: boolean } }
  original?: { variants: SalesText[]; followups: SalesText[] }
  history?: HistoryEvent[]
  sent?: { at: string; by: string; variant: number; text: string; activity_id?: string | null }
  source?: 'revenue-os' | 'content-studio'
  model?: string; cost_usd?: number
}

export const draftTitle = (f: SalesForm) => `${f.name || 'Unbekannt'}${f.company ? ' · ' + f.company : ''} · ${CHANNELS[f.channel]?.label || 'Akquise'}`
export const authorOf = (email: string | null | undefined): Author => /simon/i.test(email || '') ? 'simon' : 'henri'
