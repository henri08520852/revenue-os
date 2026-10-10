import Link from 'next/link'
import { ArrowRight, CalendarDays, CheckSquare, Flame, Handshake, Radio, Video } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import DueList from './DueList'
import { groupTasks } from '@/lib/due'
import { getTeamContext } from '@/lib/team'
import { loadTasks } from '@/lib/tasks'
import { getMeetingData } from '@/lib/meetingData'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function Kpi({ label, value, hint, Icon, tone, href }: { label: string; value: string | number; hint?: string; Icon: any; tone: string; href: string }) {
  return (
    <Link href={href} className="group rounded-lg border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-pop">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className={`flex size-7 items-center justify-center rounded-md ${tone}`}><Icon className="size-4" /></span>
      </div>
      <p className="tabular mt-2 text-[26px] font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  )
}

export default async function TodayPage({ searchParams }: { searchParams: { mine?: string } }) {
  const supabase = createClient() as any
  const { me, team } = await getTeamContext()
  const mineOnly = searchParams.mine === '1' && !!me

  // Due tasks: everything up to the end of this week (incl. overdue); DueList buckets by Berlin day
  const dueUntil = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  let meetingsQuery = supabase
    .from('calendar_events')
    .select('id, user_id, title, start_at, end_at, all_day, meet_link, company:companies(id, name)')
    .eq('project_id', PROJECT_ID)
    .gte('start_at', new Date(Date.now() - 86400000).toISOString())
    .lte('start_at', new Date(Date.now() + 86400000).toISOString())
    .order('start_at', { ascending: true })
  if (mineOnly) meetingsQuery = meetingsQuery.eq('user_id', me!.user_id)

  const [dueTasks, taskData, { data: rawMeetings }, { data: deals }, { data: hot }, { count: newHot }, { data: signals }] = await Promise.all([
    loadTasks({ dueBefore: dueUntil, ownerId: mineOnly ? me!.user_id : null }),
    getMeetingData(),
    meetingsQuery,
    supabase.from('opportunities').select('value_eur').eq('project_id', PROJECT_ID).not('stage', 'in', '(won,lost)'),
    supabase.from('candidate_companies').select('id, name, score, hiring').eq('project_id', PROJECT_ID).eq('source_type', 'hiring').eq('status', 'pending')
      .order('score', { ascending: false, nullsFirst: false }).limit(5),
    supabase.from('candidate_companies').select('id', { count: 'exact', head: true }).eq('project_id', PROJECT_ID).eq('source_type', 'hiring').eq('status', 'pending').gte('created_at', weekAgo),
    supabase.from('signals').select('id, reason, signal_type, detected_at, company:companies(id, name)').eq('project_id', PROJECT_ID).eq('status', 'active')
      .order('detected_at', { ascending: false }).limit(6),
  ])

  // Today's meetings from the synced team calendars (Berlin day, duplicates of shared events removed)
  const berlinToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
  const seenMeetings = new Set<string>()
  const meetings = (rawMeetings || []).filter((m: any) => {
    const day = m.all_day ? m.start_at.slice(0, 10) : new Date(m.start_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
    const k = `${m.title}|${m.start_at}`
    if (day !== berlinToday || seenMeetings.has(k)) return false
    seenMeetings.add(k)
    return true
  })
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })

  const groups = groupTasks(dueTasks)
  const dueNow = groups.overdue.length + groups.today.length
  const pipeline = (deals || []).reduce((s: number, d: any) => s + (d.value_eur || 0), 0)
  const hour = Number(new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit' }))
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8">
      <div className="mb-6">
        <p className="text-[13px] text-muted-foreground">{today}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{greeting}{me?.display_name ? `, ${me.display_name}` : ''}</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Fällig" value={dueNow} hint={groups.overdue.length ? `${groups.overdue.length} überfällig` : 'nichts überfällig'} Icon={CheckSquare} tone={groups.overdue.length ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'} href="/tasks" />
        <Kpi label="Termine heute" value={meetings.length} hint={meetings[0] ? `nächster ${meetings[0].all_day ? 'ganztägig' : hhmm(meetings[0].start_at)}` : 'freier Tag'} Icon={CalendarDays} tone="bg-violet-50 text-violet-600" href="/calendar" />
        <Kpi label="Offene Pipeline" value={eur(pipeline)} hint={`${deals?.length ?? 0} offene Deals`} Icon={Handshake} tone="bg-emerald-50 text-emerald-600" href="/pipeline" />
        <Kpi label="Heiße Firmen" value={newHot ?? 0} hint="neu in den letzten 7 Tagen" Icon={Flame} tone="bg-orange-50 text-orange-600" href="/candidates" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <DueList tasks={dueTasks} data={taskData} mineOnly={mineOnly} showToggle={team.length > 0} />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Termine heute</CardTitle>
              <Link href="/calendar" className="text-xs font-medium text-brand hover:underline">Kalender</Link>
            </CardHeader>
            <CardContent>
              {!meetings.length ? <p className="text-sm text-muted-foreground">Keine Termine heute.</p> : (
                <ul className="space-y-3">
                  {meetings.map((m: any) => (
                    <li key={m.id} className="flex gap-3 text-sm">
                      <span className="tabular w-11 shrink-0 pt-px text-muted-foreground">{m.all_day ? 'ganzt.' : hhmm(m.start_at)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.title}</p>
                        <div className="mt-0.5 flex gap-3 text-xs">
                          {m.company && <Link href={`/companies/${m.company.id}`} className="text-brand hover:underline">{m.company.name}</Link>}
                          {m.meet_link && <a href={m.meet_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Video className="size-3" />Meet</a>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Heiße Firmen</CardTitle>
              <Link href="/candidates" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Alle <ArrowRight className="size-3" /></Link>
            </CardHeader>
            <CardContent>
              {!hot?.length ? <p className="text-sm text-muted-foreground">Noch keine – die Suche läuft jeden Morgen.</p> : (
                <ul className="divide-y divide-border">
                  {hot.map((c: any) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.hiring?.open} offene Stellen{c.hiring?.industry ? ` · ${c.hiring.industry.label}` : ''}
                        </p>
                      </div>
                      <Badge tone={(c.score ?? 0) >= 70 ? 'danger' : (c.score ?? 0) >= 45 ? 'warning' : 'neutral'} className="tabular">{c.score ?? '–'}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Signale bei euren Firmen</CardTitle></CardHeader>
            <CardContent>
              {!signals?.length ? <p className="text-sm text-muted-foreground">Keine neuen Signale.</p> : (
                <ul className="space-y-3">
                  {signals.map((s: any) => (
                    <li key={s.id} className="flex gap-2.5 text-sm">
                      <Radio className="mt-0.5 size-4 shrink-0 text-orange-500" />
                      <div className="min-w-0">
                        {s.company && <Link href={`/companies/${s.company.id}`} className="font-medium hover:underline">{s.company.name}</Link>}
                        <p className="line-clamp-2 text-xs text-muted-foreground">{s.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
