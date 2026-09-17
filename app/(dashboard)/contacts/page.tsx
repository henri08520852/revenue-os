import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

export default async function ContactsPage() {
  const supabase = createClient()

  const { data: people } = await supabase
    .from('people')
    .select('*, companies(name, domain)')
    .eq('project_id', PROJECT_ID)
    .order('updated_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <p className="text-sm text-gray-400">{people?.length || 0} Kontakte</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Unternehmen</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Rolle</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Kanal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(people || []).map(person => (
              <tr key={person.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">
                    {person.first_name} {person.last_name}
                  </p>
                  {person.email && <p className="text-xs text-gray-400">{person.email}</p>}
                </td>
                <td className="px-4 py-3">
                  {person.companies ? (
                    <Link href={`/companies/${person.company_id}`} className="text-gray-600 hover:text-primary-600">
                      {(person.companies as any).name}
                    </Link>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{person.title || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {person.linkedin_url && (
                      <a href={person.linkedin_url} target="_blank" rel="noopener"
                        className="text-xs text-blue-500 hover:text-blue-700">LinkedIn</a>
                    )}
                    {person.email && (
                      <a href={`mailto:${person.email}`}
                        className="text-xs text-gray-400 hover:text-gray-600">Email</a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!people?.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Noch keine Kontakte. Füge sie beim Erfassen von Aktivitäten hinzu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
