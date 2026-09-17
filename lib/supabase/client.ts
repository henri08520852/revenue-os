import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

// Browser-side Supabase client (anon key only — safe for client components)
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
