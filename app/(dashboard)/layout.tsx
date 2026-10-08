import Sidebar from '@/components/Sidebar'
import { getTeamContext } from '@/lib/team'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { me } = await getTeamContext()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f9fafb' }}>
      <Sidebar userName={me?.display_name ?? null} userEmail={me?.email ?? null} />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
