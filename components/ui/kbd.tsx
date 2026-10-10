import { cn } from '@/lib/utils'

export const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <kbd className={cn('inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground', className)}>{children}</kbd>
)
