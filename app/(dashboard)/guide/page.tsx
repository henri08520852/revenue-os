import Link from 'next/link'

// "So funktioniert's" — onboarding guide for the team. Plain server component, no data.

const FLOW = [
  { title: 'Company',  sub: 'Status: Target',            color: '#1d4ed8', bg: '#dbeafe', href: '/companies' },
  { title: 'Lead',     sub: 'Status: Warm',              color: '#6d28d9', bg: '#ede9fe', href: '/pipeline?show=leads' },
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
  ['Lead',    'Follow-up am Lead',  'Lead-Karte (Datum) oder Lead → „☑️ Aufgabe“',   '● Lead'],
  ['Deal',    'Nächster Schritt',   'Deal-Seite → „☑️ Aufgabe“ (oder Meeting planen)', '◆ Deal'],
  ['Company / Kontakt', 'Erinnerung / To-do', 'Company- oder Kontaktseite → „☑️ Aufgabe“', 'Link zur Seite'],
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
        machen daraus bei echtem Interesse einen <b>Deal</b> unter Deals – und jeden Morgen zeigt <b>Heute</b>, was zu tun ist.
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
        {[['#heute', 'Täglicher Ablauf'], ['#leads', 'Leads'], ['#deals', 'Deals'], ['#contacts', 'Kontakte & Rollen'], ['#faellig', 'Aufgaben'], ['#status', 'Company-Status'], ['#google', 'Gmail & Kalender'], ['#regeln', 'Spielregeln']].map(([href, label]) => (
          <a key={href} href={href} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 20, background: '#f3f4f6', color: '#374151', textDecoration: 'none' }}>{label}</a>
        ))}
      </div>

      <Section id="heute" title="1 · Täglicher Ablauf" intro="Starte jeden Tag auf „Heute“. Dort steht alles, was Aufmerksamkeit braucht:">
        <ol style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, paddingLeft: 20, listStyle: 'decimal' }}>
          <li><b>Fällige Aufgaben</b> – alle offenen Aufgaben (Follow-ups, Anrufe, nächste Schritte), sortiert nach Überfällig → Heute → Diese Woche. Häkchen = erledigt, Klick auf den Titel = bearbeiten. Alle Aufgaben stehen unter „Aufgaben“ in der Navigation.</li>
          <li><b>Prioritäts-Queue</b> – automatisch vorgeschlagene Aktionen auf Basis von Signalen (z. B. Funding, viele offene Stellen).</li>
          <li><b>Neue Signale</b> – was sich bei unseren Companies gerade tut.</li>
        </ol>
        <p style={{ ...lead, marginTop: 10, marginBottom: 0 }}>Ziel: „Fällig“ jeden Tag auf null bringen – erledigen, neues Datum setzen oder Lead/Deal schließen.</p>
      </Section>

      <Section id="leads" title="2 · Leads – Ansprache vor dem Deal" intro="Ein Lead ist eine Company (optional mit Ansprechpartner), die wir aktiv ansprechen. Leads und Deals stehen gemeinsam unter „Pipeline“ (Filter Alle / Leads / Deals) – links die Lead-Spalten, rechts die Deal-Spalten. Anlegen über „+ Lead“ in der Pipeline oder direkt auf der Company-Seite. Klick auf eine Lead-Karte öffnet sie zum Bearbeiten. Jeder offene Lead sollte ein Follow-up haben.">
        {LEAD_STAGES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#6d28d9' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
        <p style={{ ...lead, marginTop: 14, marginBottom: 0 }}>
          <b>In Deal umwandeln</b>: Lead-Karte in eine Deal-Spalte ziehen (Deal startet in dieser Stage) oder Button „In Deal umwandeln“ in der Lead-Karte (startet in „Discovery“). Das legt den Deal an, übernimmt den Ansprechpartner als Champion
          die Notiz und alle offenen Aufgaben. Der Lead bleibt als Herkunft auf der Deal-Seite sichtbar.
        </p>
      </Section>

      <Section id="deals" title="3 · Deals" intro="Ein Deal ist eine konkrete Verkaufschance mit Wert. In der „Pipeline“ per Drag & Drop verschieben, auf der Deal-Seite pflegen: nächster Schritt mit Datum, Wert, Buying Center, Notizen. Jeder Stage-Wechsel wird im Stage-Verlauf protokolliert.">
        {DEAL_STAGES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#c2410c' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
      </Section>

      <Section id="contacts" title="4 · Kontakte, Companies & Deals – alles an einem Ort" intro="Company, Kontakt und Deal haben jeweils eine eigene Seite im gleichen Aufbau: links Steckbrief, Schnellaktionen (Notiz, Anruf, E-Mail, LinkedIn, Meeting) und bearbeitbare Felder, in der Mitte „Anstehend“ und die Timeline mit allen E-Mails, Meetings, Notizen, Anrufen und Deal-Änderungen, rechts die Verknüpfungen – dort legst du mit „+ Kontakt“, „+ Deal“, „+ Lead“ direkt Neues an. Von überall geht es außerdem über den blauen Button „+ Neu“ oben links (Kontakt, Company, Lead, Deal, Aufgabe; eine neue Company kann dabei direkt mit angelegt werden). Eine Notiz am Kontakt erscheint automatisch auch bei Company und Deal. Auf der Deal-Seite verknüpfst du Kontakte mit ihrer Rolle (Buying Center):">
        {ROLES.map(([k, v]) => <div key={k} style={row}><b style={{ color: '#111827' }}>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>)}
      </Section>

      <Section id="faellig" title="5 · Aufgaben – ein Objekt für alle Follow-ups" intro="Jede Aufgabe hat Titel, Typ (To-do, Anruf, E-Mail, Follow-up, Meeting), Fälligkeit, Verantwortliche:n und hängt an Company, Kontakt, Lead und/oder Deal. Sie erscheint auf der jeweiligen Seite unter „Anstehend“, auf „Heute“, im Kalender und unter „Aufgaben“.">
        <div style={{ ...row, borderTop: 'none', gridTemplateColumns: '110px 1fr 1fr 110px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span>Wo</span><span>Wofür</span><span>Anlegen über</span><span>Im Kalender</span>
        </div>
        {DUE.map(([a, b, c, d]) => (
          <div key={a} style={{ ...row, gridTemplateColumns: '110px 1fr 1fr 110px' }}>
            <b>{a}</b><span style={{ color: '#4b5563' }}>{b}</span><span style={{ color: '#4b5563' }}>{c}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{d}</span>
          </div>
        ))}
        <p style={{ ...lead, marginTop: 14, marginBottom: 0 }}>Automatisch: Die <b>früheste offene Aufgabe eines Deals</b> ist sein nächster Schritt (Pipeline-Karte), die eines Leads sein Follow-up-Datum. Beim Umwandeln eines Leads wandern seine offenen Aufgaben mit in den Deal. Ein Meeting, das du aus einem Deal planst, wird auf Wunsch direkt als Aufgabe angelegt.</p>
      </Section>

      <Section id="status" title="6 · Company-Status (automatisch)" intro="Den Status musst du nicht pflegen – er folgt Leads und Deals:">
        {[['Target', 'Weder Lead noch Deal.'], ['Warm', 'Es gibt einen Lead (oder ein Deal ging verloren).'], ['Hot', 'Es gibt einen offenen Deal.'], ['Customer', 'Ein Deal wurde gewonnen.'], ['Inactive', 'Nur manuell – z. B. Firma passt dauerhaft nicht. Wird erst wieder geändert, wenn ein neuer Lead/Deal entsteht.']].map(([k, v]) => (
          <div key={k} style={row}><b>{k}</b><span style={{ color: '#4b5563' }}>{v}</span></div>
        ))}
      </Section>

      <Section id="google" title="7 · Gmail & Kalender" intro="Unter Einstellungen verbindet jede:r einmal das eigene @altoris.one-Google-Konto (nur Lesezugriff).">
        <ul style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, paddingLeft: 20, listStyle: 'disc' }}>
          <li><b>E-Mails</b> mit Kontakten (exakte Adresse) oder mit der Domain einer Company werden automatisch mit <b>vollem Text</b> als Aktivität geloggt – inklusive Zuordnung zum offenen Deal. Antworten im selben Verlauf folgen automatisch.</li>
          <li><b>Posteingang</b>: Geschäftliche E-Mails ohne Treffer landen dort. Pro Mail oder ganzem Verlauf: <b>neuen Kontakt anlegen</b> (Name, Company und Domain werden vorgeschlagen), einer bestehenden Company / Kontakt / Deal <b>zuordnen</b> oder <b>ignorieren</b>. Sobald ein Kontakt oder eine Company-Domain existiert, werden wartende und künftige Mails automatisch zugeordnet.</li>
          <li><b>Gmail-Label „Revenue OS“</b>: Lege in Gmail einmal ein Label mit genau diesem Namen an. Jede Mail mit diesem Label kommt beim nächsten Sync ins CRM – auch ältere Mails und solche, die sonst als Newsletter gefiltert würden.</li>
          <li>Interne Mails (nur @altoris.one) und Newsletter / automatische Benachrichtigungen werden nie übernommen.</li>
          <li><b>Vergangene Meetings</b> mit solchen Teilnehmer:innen werden ebenfalls als Aktivität geloggt; „Letzter Kontakt“ aktualisiert sich von selbst.</li>
          <li><b>Team-Kalender</b> (Tag / Woche / Monat) zeigt die Termine aller verbundenen Kolleg:innen plus alle offenen Aufgaben. Gemeinsame Termine erscheinen nur einmal. „+ Aufgabe“ legt direkt eine Aufgabe an.</li>
          <li><b>Meetings planen</b>: „+ Meeting“ im Kalender (oder Klick auf eine freie Uhrzeit), „📅 Meeting“ auf Company- und Deal-Seite. Teilnehmer aus den Kontakten wählen, Google-Meet-Link wird automatisch erstellt, Google verschickt die Einladung. Mit Deal verknüpft, wird das Meeting zum nächsten Schritt.</li>
          <li>Der Sync läuft beim Öffnen der App (höchstens alle 10 Minuten) und einmal täglich automatisch.</li>
        </ul>
      </Section>

      <Section id="regeln" title="8 · Spielregeln für das Team">
        <ul style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, paddingLeft: 20, listStyle: 'disc' }}>
          <li>Jeder offene Lead und jeder offene Deal hat mindestens eine offene Aufgabe mit Datum.</li>
          <li>Gespräche und Calls als Aktivität loggen, kurze Gedanken als Notiz – so weiß jeder, was zuletzt passiert ist.</li>
          <li>Umwandeln, sobald ein Termin mit Bedarf steht – nicht erst beim Angebot.</li>
          <li>Verlorene Deals mit „Verloren“ schließen statt liegen lassen – die Deal-Übersicht bleibt so ehrlich.</li>
        </ul>
      </Section>
    </div>
  )
}
