import Sidebar from '@/components/Sidebar'
import { getTeamContext } from '@/lib/team'
import NoAccess from './NoAccess'
import GoogleAutoSync from '@/components/GoogleAutoSync'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { me, denied, email } = await getTeamContext()
  if (denied) return <NoAccess email={email ?? null} />
  // Badge for the Posteingang (0 while migration 023 is missing)
  const { count: inboxCount } = await (createClient() as any).from('emails')
    .select('id', { count: 'exact', head: true }).eq('project_id', process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID).eq('status', 'inbox')
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f9fafb' }}>
      <Sidebar userName={me?.display_name ?? null} userEmail={me?.email ?? null} inboxCount={inboxCount ?? 0} />
      <GoogleAutoSync />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
