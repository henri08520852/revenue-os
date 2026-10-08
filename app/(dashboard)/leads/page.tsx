import { redirect } from 'next/navigation'

// Leads and deals share one funnel board on /pipeline
export default function LeadsPage({ searchParams }: { searchParams: { focus?: string; owner?: string } }) {
  const q = new URLSearchParams({ show: 'leads' })
  if (searchParams.focus) { q.delete('show'); q.set('focus', searchParams.focus) }
  if (searchParams.owner) q.set('owner', searchParams.owner)
  redirect(`/pipeline?${q}`)
}
