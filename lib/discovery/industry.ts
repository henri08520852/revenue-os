// Industry + "office share" of an employer, from its name, domain and job titles (rule-based, free).
// Office/knowledge roles (developer, consultant, sales, accounting …) fit HireFlow better than
// shop-floor roles (mechanic, driver, warehouse …): more applicants per role and screening by questions.

export const INDUSTRIES: { key: string; label: string; name: RegExp; titles: RegExp }[] = [
  { key: 'it', label: 'IT & Software', name: /software|digital|\bit\b|it[- ]?(service|solution|consult)|tech|systems?\b|cloud|data|cyber|\bai\b|labs?\b|\.io\b|apps?\b|saas|informatik|netzwerk|network/i, titles: /entwickler|developer|engineer|devops|software|frontend|backend|full[- ]?stack|data|administrator|it[- ]|cloud|scrum|product owner|ux|ui|qa\b|tester/i },
  { key: 'consulting', label: 'Beratung & Dienstleistung', name: /consult|beratung|berater|partners?\b|advisory|steuer|kanzlei|rechtsanw|wirtschaftsprüf|audit|agentur|agency|management|services?\b|dienstleist|solutions/i, titles: /berater|consultant|steuerfach|steuerberat|rechtsanw|jurist|wirtschaftsprüf|projektleit|projektmanag|analyst|account manager/i },
  { key: 'finance', label: 'Finanzen & Versicherung', name: /finanz|finance|bank|versicher|insurance|invest|capital|asset|treasury|leasing|fintech|payment|kredit/i, titles: /finanz|versicherung|bankkauf|kredit|fonds|portfolio|risk|compliance|actuar/i },
  { key: 'health', label: 'Gesundheit & Pflege', name: /pflege|klinik|kranken|medizin|medical|health|gesundheit|praxis|apothek|pharma|senior|care\b|therapie|reha|dental|zahn/i, titles: /pflege|arzt|ärzt|therapeut|medizinische|mfa\b|zahnmed|apothek|pharma|klinisch|gesundheits/i },
  { key: 'industry', label: 'Industrie & Produktion', name: /maschinenbau|industrie|industrial|technik|werke?\b|metall|anlagen|automation|fertigung|produktion|manufactur|engineering|electric|elektro|trailer|systeme?\b|kunststoff|chemie|stahl/i, titles: /zerspan|mechatroniker|industriemechan|elektroniker|schweiß|cnc|fertigung|produktion|maschinen|konstrukt|anlagen|instandhalt|qualitätssicher/i },
  { key: 'construction', label: 'Handwerk & Bau', name: /\bbau\b|bauunternehm|handwerk|dach|elektro(technik)? \w+|sanitär|heizung|haustechnik|maler|tischler|schreiner|gebäude|immobilien|facility|garten/i, titles: /maurer|zimmerer|dachdecker|anlagenmechaniker|shk|elektriker|maler|tischler|bauleit|polier|baggerfahrer|hausmeister|facility/i },
  { key: 'retail', label: 'Handel & E-Commerce', name: /handel|shop|store|retail|e-?commerce|markt|fashion|mode|möbel|grosshandel|großhandel|vertrieb(s)?gesellschaft/i, titles: /verkäufer|einzelhandel|filial|kassier|e-?commerce|category|merchandis|store manager/i },
  { key: 'logistics', label: 'Logistik & Transport', name: /logisti|spedition|transport|cargo|freight|kurier|express|lager|fulfillment|shipping|mobility|verkehr/i, titles: /lager|fahrer|kommission|disponent|logistik|spedition|berufskraft|staplerfahrer|zusteller/i },
  { key: 'automotive', label: 'Automobil & Autohaus', name: /auto(haus|mobil|hof|zentrum|center|service)|kfz|fahrzeug|motors?\b|car\b|reifen/i, titles: /kfz|kraftfahrzeug|automobilkauf|serviceberater|karosserie|fahrzeuglackier|zweirad/i },
  { key: 'hospitality', label: 'Gastronomie & Hotel', name: /hotel|gastro|restaurant|catering|resort|hospitality|café|cafe|bäckerei|brauerei/i, titles: /koch|köchin|kellner|service ?kraft|rezeption|housekeeping|barkeeper|bäcker|konditor/i },
  { key: 'education', label: 'Bildung & Soziales', name: /schule|akademie|bildung|kita|kinder|sozial|jugend|verein|stiftung|lebenshilfe|e\.v\./i, titles: /erzieh|lehrer|dozent|sozialarbeit|sozialpäd|heilerzieh|pädagog|trainer/i },
  { key: 'energy', label: 'Energie & Umwelt', name: /energie|energy|solar|wind|strom|power|umwelt|recycling|wasser|green|klima|wärme/i, titles: /photovoltaik|solar|energie|umwelt|wärmepump/i },
  { key: 'media', label: 'Medien & Marketing', name: /media|medien|verlag|marketing|werbe|kommunikation|pr\b|studio|design|film/i, titles: /redakteur|journalist|grafik|mediengestalt|content|social media|marketing|designer/i },
]

const OFFICE = /entwickler|developer|engineer(?!ing)|berater|consultant|manager|referent|sachbearbeit|kaufm|controller|controlling|buchhalt|accountant|account|marketing|vertrieb|sales|projekt|analyst|designer|administrator|support|assistenz|personal|recruit|jurist|steuer|redakt|produkt|einkauf|data|\bit\b|it-|software|finanz|business|product|office|backoffice|key account|customer success|scrum|ux|hr\b|operations/i
const SHOPFLOOR = /mechaniker|mechatroniker|monteur|fahrer|lager|kommission|helfer|elektriker|elektroniker|schweiß|zerspan|maler|maurer|koch|köchin|servicekraft|service ?kraft|reinigung|pflegefach|pflegekraft|altenpfleg|produktionsmitarbeiter|maschinenbediener|schlosser|tischler|installateur|kfz|anlagenfahrer|staplerfahrer|bäcker|verkäufer|kassierer|zusteller|hausmeister|gärtner|dachdecker|zimmerer|bauhelfer|fachkraft für lager|metallbau/i

// Care, education and social roles are neither office nor shop floor (Schulbegleitung, Erzieher, Pflege …)
const CARE = /erzieh|pädagog|paedagog|schulbegleit|integrationsassist|integrationshelf|sozial|heilerzieh|pflege|betreu|kinder|therapeut|hauswirtschaft|alltagsbegleit|assistenz(?:kraft)? (?:in|für) (?:der )?(?:pflege|betreuung)/i

export function classify(name: string, domain: string | null, titles: string[]) {
  const scores = INDUSTRIES.map(ind => {
    let s = ind.name.test(name) ? 4 : 0
    if (domain && ind.name.test(domain.replace(/\.[a-z]+$/, ''))) s += 1
    for (const t of titles) if (ind.titles.test(t)) s += 1
    return { key: ind.key, label: ind.label, s }
  }).sort((a, b) => b.s - a.s)
  const top = scores[0]
  const industry = top.s >= 2 ? { key: top.key, label: top.label } : null

  let office = 0, other = 0
  for (const t of titles) {
    if (CARE.test(t) || SHOPFLOOR.test(t)) other++
    else if (OFFICE.test(t)) office++
  }
  // Share among the roles we could place; too few placed roles → no statement
  const officeShare = office + other >= 3 ? Math.round((office / (office + other)) * 100) : null
  return { industry, officeShare }
}

// Score adjustment for the ICP: knowledge/office work and people-heavy services up, car dealers and shop floor down
export function icpAdjust(industry: string | null, officeShare: number | null) {
  let d = 0
  if (officeShare != null) d += officeShare >= 60 ? 10 : officeShare <= 25 ? -15 : 0
  if (industry === 'consulting' || industry === 'it' || industry === 'finance') d += 5
  if (industry === 'automotive' || industry === 'hospitality') d -= 15
  return d
}
