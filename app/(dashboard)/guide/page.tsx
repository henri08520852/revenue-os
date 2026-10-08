import Link from 'next/link'

// "So funktioniert's" — onboarding guide for the team. Plain server component, no data.

const FLOW = [
  { title: 'Company',  sub: 'Status: Target',            color: '#1d4ed8', bg: '#dbeafe', href: '/companies' },
  { title: 'Lead',     sub: 'Status: Warm',              color: '#6d28d9', bg: '#ede9fe', href: '/leads' },
  { title: 'Deal',     sub: 'Status: Hot',               color: '#c2410c', bg: '#ffedd5', href: '/pipeline' },
  { title: 'Gewonnen', sub: 'Status: Customer',          color: '#15803d', bg: '#dcfce7', href: '/pipeline' },
]

const LEAD_STAGES = [
  ['Outreach',        'Wir sprechen die Company an (LinkedIn, E-Mail, Intro) – noch keine Reaktion.'],
  ['Kontaktiert',     'Es gibt eine Reaktion oder ein Gespräch ist angebahnt.'],
  ['Qualifiziert',    'Bedarf ist bestätigt, Ansprechpartner bekannt, Timing passt → jetzt in einen Deal umwandeln.'],
  ['Disqualifiziert', 'Kein Bedarf / passt nicht. Bleibt zur Dokumentation erhalten.'],
]

const DEAL_STAGES = [
  ['Discovery',    'Deal ist angelegt, Bedarf und Situation werden geklärt.'],
  ['Erstgespräch', 'Erster richtiger Termin hat stattgefunden.'],
  ['Evaluation',   'Demo / Test, weitere Stakeholder sind eingebunden.'],
  ['Proposal',     'Angebot ist raus.'],
  ['Verhandlung',  'Konditionen, Vertrag, finale Freigabe.'],
  ['Gewonnen / Verloren', 'Abschluss – setzt die Company automatisch auf Customer bzw. zurück auf Warm.'],
]

const DUE = [
  ['Lead',    'Follow-up-Datum',  'Auf der Lead-Karte (/leads)',            'LEAD'],
  ['Deal',    'Nächster Schritt + Fällig am', 'Deal-Seite → „Deal bearbeiten“', 'DEAL'],
  ['Company', 'Erinnerung',        'Company-Seite → „⏰ Erinnerung“',        'ERINNERUNG'],
]

const ROLES = [
  ['⭐ Champion',        'Treibt das Thema intern für uns voran.'],
  ['🎯 Decision Maker',  'Trifft die fachliche Entscheidung.'],
  ['💰 Economic Buyer',  'Gibt das Budget frei.'],
  ['👥 Stakeholder',     'Ist beteiligt, entscheidet aber nicht.'],
]

const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 20 }
const h2 = { fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 6 }
const lead = { fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 14 }
const row = { display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, padding: '9px 0', borderTop: '1px solid #f3f4f6', fontSize: 13 }

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section id={id} style={{ ...card, scrollMarginTop: 24 }}>
      <h2 style={h2}>{title}</h2>
      {intro && <p style={lead}>{intro}</p>}
      {children}
    </section>
  )
}

export default function GuidePage() {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>Für Henri, Simon & neue Kolleg:innen</p>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 8 }}>So funktioniert Revenue OS</h1>
      <p style={{ ...lead, fontSize: 15 }}>
        Revenue OS bildet unseren Vertrieb in einer Kette ab: Wir finden <b>Companies</b>, sprechen sie als <b>Lead</b> an,
        machen daraus bei echtem Interesse einen <b>Deal</b> in der Pipeline – und jeden Morgen zeigt <b>Heute</b>, was zu tun ist.
      </p>

      {/* Flow */}
      <div style={{ ...card, display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
        {FLOW.map((f, i) => (
          <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 150px' }}>
            <Link href={f.href} style={{ flex: 1, textDecoration: 'none', background: f.bg, borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: f.color }}>{f.title}</p>
              <p style={{ fontSize: 12, color: f.color, opacity: 0.8, marginTop: 2 }}>{f.sub}</p>
            </Link>
            {i < FLOW.length - 1 && <span style={{ fontSize: 18, color: '#9ca3af' }}>→</span>}
          </div>
        ))}
        <p style={{ flexBasis: '100%', fontSize: 12, color: '#6b7280', marginTop: 10 }}>
          Kontakte (Personen) hängen an der Company und werden im Lead bzw. im Deal als Ansprechpartner verknüpft.
          Der Company-Status wird <b>automatisch</b> aus Leads und Deals gesetzt.
        </p>
      </div>

      {/* TOC */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {[['#heute', 'Täglicher Ablauf'], ['#leads', 'Leads'], ['#deals', 'Deals & Pipeline'], ['#contacts', 'Kontakte & Rollen'], ['#faellig', 'Follow-ups'], ['#status', 'Company-Status'], ['#regeln', 'Spielregeln']].map(([href, label]) => (
          <a key={href} href={href} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 20, background: '#f3f4f6', color: '#374151', textDecoration: 'none' }}>{label}</a>
        ))}
      </div>

      <Section id="heute" title="1 · Täglicher Ablauf" intro="Starte jeden Tag auf „Heute“. Dort steht alles, was Aufmerksamkeit braucht:">
        <ol style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, paddingLeft: 20, listStyle: 'decimal' }}>
          <li><b>Fällig</b> – Follow-ups von Leads, nächste Schritte von Deals und Company-Erinnerungen, sortiert nach Überfällig → Heute → Diese Woche. Klick öffnet direkt den Lead/Deal.</li>
          <li><b>Prioritäts-Queue</b> – automatisch vorgeschlagene Aktionen auf Basis von Signalen (z. B. Funding, viele offene Stellen).</li>
          <li><b>Neue Signale</b> – was sich bei unseren Companies gerade tut.</li>
        </ol>
        <p style={{ ...lead, marginTop: 10, marginBottom: 0 }}>Ziel: „Fällig“ jeden Tag auf null bringen – erledigen, neues Datum setzen oder Lead/Deal schließen.</p>
      </Section>

      <Section id="leads" title="2 · Leads – Ansprache vor dem Deal" intro="Ein Lead ist eine Company (optional mit Ansprechpartner), die wir aktiv ansprechen. Anlegen über „+ Lead“ auf der Leads-Seite oder direkt auf der Company-Seite. Jeder offene Lead sollte ein Follow-up-Datum haben.">
        {LEAD_STAGES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#6d28d9' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
        <p style={{ ...lead, marginTop: 14, marginBottom: 0 }}>
          <b>In Deal umwandeln</b> (Button auf der Lead-Karte): legt den Deal in „Discovery“ an, übernimmt den Ansprechpartner als Champion
          und die Notiz – und öffnet direkt die Deal-Seite. Der Lead bleibt als „Umgewandelt“ mit Link zum Deal erhalten.
        </p>
      </Section>

      <Section id="deals" title="3 · Deals & Pipeline" intro="Ein Deal ist eine konkrete Verkaufschance mit Wert. Auf der Pipeline per Drag & Drop verschieben, auf der Deal-Seite pflegen: nächster Schritt mit Datum, Wert, Buying Center, Notizen. Jeder Stage-Wechsel wird im Stage-Verlauf protokolliert.">
        {DEAL_STAGES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#c2410c' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
      </Section>

      <Section id="contacts" title="4 · Kontakte & Buying Center" intro="Kontakte sind Personen bei einer Company. Anlegen unter Contacts oder auf der Company-Seite (+ Kontakt). Auf der Deal-Seite verknüpfst du sie mit ihrer Rolle in diesem Deal – fehlen wichtige Rollen, zeigt die Seite einen Hinweis.">
        {ROLES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#111827' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
      </Section>

      <Section id="faellig" title="5 · Follow-ups – wo setze ich was?" intro="Es gibt drei Arten von Terminen. Alle landen automatisch auf „Heute → Fällig“.">
        <div style={{ ...row, borderTop: 'none', gridTemplateColumns: '110px 1fr 1fr 110px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Wo</span><span>Feld</span><span>Setzen in</span><span>Label in Fällig</span>
        </div>
        {DUE.map(([a, b, c, d]) => (
          <div key={a} style={{ ...row, gridTemplateColumns: '110px 1fr 1fr 110px' }}>
            <b>{a}</b><span style={{ color: '#4b5563' }}>{b}</span><span style={{ color: '#4b5563' }}>{c}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{d}</span>
          </div>
        ))}
        <p style={{ ...lead, marginTop: 14, marginBottom: 0 }}>Faustregel: Gibt es einen Deal, nutze den <b>nächsten Schritt</b> im Deal. Gibt es nur einen Lead, das <b>Follow-up</b> am Lead. Die <b>Erinnerung</b> an der Company ist für alles davor (z. B. „in 3 Monaten nochmal schauen“).</p>
      </Section>

      <Section id="status" title="6 · Company-Status (automatisch)" intro="Den Status musst du nicht pflegen – er folgt Leads und Deals:">
        {[['Target', 'Weder Lead noch Deal.'], ['Warm', 'Es gibt einen Lead (oder ein Deal ging verloren).'], ['Hot', 'Es gibt einen offenen Deal.'], ['Customer', 'Ein Deal wurde gewonnen.'], ['Inactive', 'Nur manuell – z. B. Firma passt dauerhaft nicht. Wird erst wieder geändert, wenn ein neuer Lead/Deal entsteht.']].map(([k, v]) => (
          <div key={k} style={row}><b>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>
        ))}
      </Section>

      <Section id="regeln" title="7 · Spielregeln für das Team">
        <ul style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, paddingLeft: 20, listStyle: 'disc' }}>
          <li>Jeder offene Lead hat ein Follow-up-Datum, jeder offene Deal einen nächsten Schritt mit Datum.</li>
          <li>Gespräche und Calls als Aktivität loggen, kurze Gedanken als Notiz – so weiß jeder, was zuletzt passiert ist.</li>
          <li>Umwandeln, sobald ein Termin mit Bedarf steht – nicht erst beim Angebot.</li>
          <li>Verlorene Deals mit „Verloren“ schließen statt liegen lassen – die Pipeline bleibt so ehrlich.</li>
        </ul>
      </Section>
    </div>
  )
}
