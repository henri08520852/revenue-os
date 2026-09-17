"use client"

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'

const nav = [
  { href: '/today',     label: 'Heute',       icon: CalendarDaysIcon },
  { href: '/companies', label: 'Companies',   icon: BuildingOffice2Icon },
  { href: '/contacts',  label: 'Contacts',    icon: UserGroupIcon },
  { href: '/pipeline',  label: 'Pipeline',    icon: ChartBarIcon },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <BoltIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900">Revenue OS</span>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">by Hireflow</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Cog6ToothIcon className="w-4 h-4 text-gray-400" />
          Einstellungen
        </Link>
        <div className="mt-3 px-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs text-gray-400">Supabase verbunden</span>
          </div>
        </div>
      </div>
    </aside>
  )
}