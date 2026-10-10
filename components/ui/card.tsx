import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-card', className)} {...p} />
)
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between gap-3 px-5 pt-4 pb-3', className)} {...p} />
)
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-[15px] font-semibold tracking-tight', className)} {...p} />
)
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-5 pb-5', className)} {...p} />
)
