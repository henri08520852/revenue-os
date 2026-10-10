import Sidebar from '@/components/Sidebar'
import { getTeamContext } from '@/lib/team'
import NoAccess from './NoAccess'
import GoogleAutoSync from '@/components/GoogleAutoSync'
import { Toaster } from 'sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { me, denied, email } = await getTeamContext()
  if (denied) return <NoAccess email={email ?? null} />
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar userName={me?.display_name ?? null} userEmail={me?.email ?? null} />
      <GoogleAutoSync />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </div>
  )
}
