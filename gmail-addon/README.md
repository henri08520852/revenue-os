# Revenue OS – Gmail Add-on

Seitenleiste in Gmail: zeigt zur geöffneten E-Mail Kontakt, Company, Deals, Aufgaben und
letzte Aktivitäten aus Revenue OS und loggt die Mail (oder den ganzen Verlauf) mit einem Klick.
Unbekannte Absender lassen sich direkt als Kontakt (mit neuer Company) anlegen.

- `Code.gs`, `appsscript.json` – das Add-on (Google Apps Script)
- `app/api/addon/route.ts` – die Schnittstelle in Revenue OS
- `lib/addon/auth.ts` – Prüfung: Google-ID-Token, verifiziertes @altoris.one-Konto, Team-Mitglied,
  und das Token muss für genau dieses Add-on ausgestellt sein (`GMAIL_ADDON_AUDIENCE`)

## Einrichtung (einmalig, ca. 20 Minuten)

1. **Projekt anlegen**: <https://script.google.com> → *Neues Projekt* → Name „Revenue OS Gmail“.
2. **Manifest sichtbar machen**: links ⚙️ *Projekteinstellungen* → Haken bei
   *„Manifestdatei appsscript.json im Editor anzeigen“*.
3. **Code einfügen**: im Editor `Code.gs` komplett durch den Inhalt von `gmail-addon/Code.gs`
   ersetzen, `appsscript.json` durch `gmail-addon/appsscript.json`. Speichern.
4. **Google-Cloud-Projekt verknüpfen**: ⚙️ *Projekteinstellungen* → *Google Cloud Platform-Projekt* →
   *Projekt ändern* → die **Projektnummer** des Cloud-Projekts eintragen, das ihr schon für den
   Revenue-OS-Login nutzt (console.cloud.google.com → Projekt-Dashboard → „Projektnummer“).
5. **Installieren (Test)**: oben *Bereitstellen* → *Bereitstellungen testen* → *Installieren* → *Fertig*.
6. **In Gmail öffnen**: Gmail neu laden, eine E-Mail öffnen, rechts in der Seitenleiste das
   Revenue-OS-Symbol anklicken → *Zugriff autorisieren* → Konto wählen → *Zulassen*.
7. **Freischalten**: Beim ersten Mal steht dort
   „Add-on noch nicht freigeschaltet … GMAIL_ADDON_AUDIENCE = 1234…apps.googleusercontent.com“.
   Diesen Wert in Vercel unter *Settings → Environment Variables* als `GMAIL_ADDON_AUDIENCE`
   (Production) eintragen und unter *Deployments* das letzte Deployment *Redeploy*en –
   neue Umgebungsvariablen gelten erst ab dem nächsten Deployment.
8. Gmail neu laden – fertig.

## Weitere Teammitglieder

Am einfachsten: im Script-Projekt oben *Teilen* → Kollegin/Kollege als *Bearbeiter* hinzufügen →
sie öffnen das Projekt einmal und klicken ebenfalls *Bereitstellen → Bereitstellungen testen → Installieren*.
(Für viele Nutzer: privat über das Google Workspace Marketplace SDK veröffentlichen und in der
Admin-Konsole für die Domain installieren.)

## Updates

Neuen Code aus `gmail-addon/` in das Script-Projekt kopieren und speichern – die Test-Installation
nutzt automatisch den neuesten Stand.
