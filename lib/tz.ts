// The team works in Europe/Berlin. Format dates with an explicit time zone so the
// server (UTC on Vercel) and the browser render the same text (no hydration mismatch).
export const TZ = 'Europe/Berlin'

export const dayKeyBerlin = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

export const hhmmBerlin = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

export const minutesOfDayBerlin = (d: Date) => {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number)
  return (h % 24) * 60 + m
}

export const fmtBerlin = (iso: string | Date, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString('de-DE', { timeZone: TZ, ...opts })
