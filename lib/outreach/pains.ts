// Pain catalogue for the relevance check (pure data, safe for client components)
export type PainKey = 'reposted' | 'long_open' | 'builds_recruiting' | 'repeated_role' | 'no_hr' | 'new_jobs' | 'volume' | 'many_jobs'

// Evidence → typical pain → the HireFlow result that answers it → the question at the end
export const PAINS: Record<PainKey, { label: string; pain: string; angle: string; question: string }> = {
  reposted: {
    label: 'Stelle erneut ausgeschrieben',
    pain: 'Die Stelle war schon einmal ausgeschrieben – die Besetzung hat nicht gehalten oder ist gescheitert, die fehlende Passung zeigt sich zu spät.',
    angle: 'Strukturierte Vorauswahl mit denselben Fragen für alle, bevor jemand ins Gespräch geht – Passung zeigt sich vorher.',
    question: 'Woran ist es beim letzten Mal gescheitert – an zu wenigen passenden Bewerbungen oder an der Passung?',
  },
  long_open: {
    label: 'Stelle lange offen',
    pain: 'Passende Bewerber:innen springen ab oder gehen unter, weil Vorauswahl und Rückmeldung zu lange dauern.',
    angle: 'Das Vorinterview läuft sofort und rund um die Uhr – die Passenden sind nach Stunden sichtbar, nicht nach Wochen.',
    question: 'Liegt es eher an zu wenigen Bewerbungen oder daran, dass die Passenden zu lange warten?',
  },
  builds_recruiting: {
    label: 'Sucht selbst HR/Recruiting',
    pain: 'Das Recruiting-Volumen ist größer als das Team – bis die neue Person da und eingearbeitet ist, bleibt die Vorauswahl liegen.',
    angle: 'Entlastet die Vorauswahl sofort, nicht erst nach der Einarbeitung.',
    question: 'Wie überbrückt ihr die Zeit, bis die Stelle besetzt ist?',
  },
  repeated_role: {
    label: 'Mehrere gleiche Stellen',
    pain: 'Viele ähnliche Bewerbungen, die alle einzeln gesichtet und am Telefon vorqualifiziert werden.',
    angle: 'Aus 20 Bewerbungen die drei relevantesten, ohne Telefon-Screening.',
    question: 'Wie viel Zeit geht aktuell in die Vorauswahl für diese Rolle?',
  },
  no_hr: {
    label: 'Kein HR – Leitung macht es selbst',
    pain: 'Geschäftsführung oder Fachbereich sichten Bewerbungen und führen Erstgespräche neben dem Tagesgeschäft.',
    angle: 'Nur noch Gespräche mit den Passenden – die Vorauswahl läuft, ohne eigene Zeit zu kosten.',
    question: 'Wer macht bei euch die Vorauswahl, und wie viel Zeit geht da pro Woche rein?',
  },
  new_jobs: {
    label: 'Wachstum, viele neue Stellen',
    pain: 'Viele Stellen auf einmal neu – die Bewerbungen kommen gebündelt und der Prozess hält nicht Schritt.',
    angle: 'Die Vorauswahl wächst mit, ohne zusätzliche Leute.',
    question: 'Wie kommt ihr mit dem aktuellen Bewerbungsaufkommen hinterher?',
  },
  volume: {
    label: 'Volumen-Rollen (Schicht, Service, Lager …)',
    pain: 'Viele Bewerbungen, aber ein großer Teil scheitert an Grundvoraussetzungen wie Schicht, Führerschein oder Verfügbarkeit – und das zeigt sich erst im Gespräch.',
    angle: 'Knock-out-Fragen im Vorinterview klären die Grundvoraussetzungen automatisch.',
    question: 'Wie viele Bewerbungen scheitern bei euch an den Grundvoraussetzungen?',
  },
  many_jobs: {
    label: 'Viele offene Stellen',
    pain: 'Viele Prozesse parallel – die Vorauswahl verteilt sich auf viele Schultern und wird uneinheitlich.',
    angle: 'Eine einheitliche Vorauswahl für alle Stellen, vergleichbar und ohne Mehraufwand.',
    question: 'Wie behaltet ihr bei so vielen Stellen den Überblick über die Vorauswahl?',
  },
}
