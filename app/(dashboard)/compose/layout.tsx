import MessagesTabs from '@/components/MessagesTabs'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (<><MessagesTabs />{children}</>)
}
