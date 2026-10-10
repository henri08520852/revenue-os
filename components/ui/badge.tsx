import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'border-border bg-muted text-muted-foreground',
      brand: 'border-blue-200 bg-blue-50 text-blue-700',
      success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      warning: 'border-amber-200 bg-amber-50 text-amber-800',
      danger: 'border-red-200 bg-red-50 text-red-700',
      violet: 'border-violet-200 bg-violet-50 text-violet-700',
      sky: 'border-sky-200 bg-sky-50 text-sky-700',
      outline: 'border-border bg-card text-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />
