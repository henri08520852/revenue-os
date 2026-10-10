import { Skeleton } from '@/components/ui/skeleton'

// Shown instantly on navigation while the server renders the next page
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8" aria-busy="true" aria-label="Lädt …">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14" />)}
      </div>
    </div>
  )
}
