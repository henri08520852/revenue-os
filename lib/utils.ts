import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes; later ones win (shadcn/ui convention)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
