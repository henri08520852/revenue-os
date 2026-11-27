import { createClient } from '@/lib/supabase/server'
import { loadAkquise } from '@/lib/akquise/write'
import AkquiseSettings from './AkquiseSettings'

export const dynamic = 'force-dynamic'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID!

export default async function SettingsPage() {
  const supabase = createClient() as any
  const [{ cfg, fm }, { data: samples }] = await Promise.all([
    loadAkquise(supabase, PROJECT_ID),
    supabase.from('sales_voice_samples').select('id, author, channel, text, created_by, created_at').order('created_at', { ascending: false }).limit(80),
  ])
  return <AkquiseSettings cfg={cfg} fm={fm} samples={samples || []} />
}
