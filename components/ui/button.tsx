import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand text-brand-foreground shadow-sm hover:bg-brand/90',
        outline: 'border border-input bg-card shadow-sm hover:bg-accent',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        ghost: 'hover:bg-accent',
        link: 'text-brand underline-offset-4 hover:underline',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: { default: 'h-9 px-3.5', sm: 'h-8 px-2.5 text-[13px]', lg: 'h-10 px-5', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'
