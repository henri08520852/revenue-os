import Sidebar from '@/components/Sidebar'
import { getTeamContext } from '@/lib/team'
import NoAccess from './NoAccess'
import GoogleAutoSync from '@/components/GoogleAutoSync'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { me, denied, email } = await getTeamContext()
  if (denied) return <NoAccess email={email ?? null} />
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f9fafb' }}>
      <Sidebar userName={me?.display_name ?? null} userEmail={me?.email ?? null} />
      <GoogleAutoSync />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
