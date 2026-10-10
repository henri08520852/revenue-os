// Due-date buckets in Berlin time (shared by the Today page and the task lists)
import type { Task } from '@/lib/tasks'

const TZ = 'Europe/Berlin'

// YYYY-MM-DD of a date in Berlin time
export function dayKey(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export function dueBuckets(now = new Date()) {
  const todayKey = dayKey(now)
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const daysToSunday = (7 - weekday) % 7
  const sunday = new Date(`${todayKey}T12:00:00Z`)
  sunday.setUTCDate(sunday.getUTCDate() + daysToSunday)
  return { todayKey, weekEndKey: sunday.toISOString().slice(0, 10) }
}

export function groupTasks(tasks: Task[], now = new Date()) {
  const { todayKey, weekEndKey } = dueBuckets(now)
  const overdue: Task[] = [], today: Task[] = [], week: Task[] = [], later: Task[] = [], none: Task[] = []
  for (const t of tasks) {
    if (!t.due_at) { none.push(t); continue }
    const key = dayKey(new Date(t.due_at))
    if (key < todayKey) overdue.push(t)
    else if (key === todayKey) today.push(t)
    else if (key <= weekEndKey) week.push(t)
    else later.push(t)
  }
  return { overdue, today, week, later, none }
}

