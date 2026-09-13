'use client'
 
import Link from 'next/link'
import { usePathname } from 'next/navigation'
 
const nav = [
  {
    href: '/today',
    label: 'Today',
    icon: '⚡',
    color: 'from-violet-500 to-violet-600',
    activeText: 'text-violet-300',
    activeBg: 'bg-violet-500/20',
  },
  {
    href: '/companies',
    label: 'Companies',
    icon: '🏢',
    color: 'from-sky-500 to-sky-600',
    activeText: 'text-sky-300',
    activeBg: 'bg-sky-500/20',
  },
  {
    href: '/contacts',
    label: 'Contacts',
    icon: '👤',
    color: 'from-emerald-500 to-emerald-600',
    activeText: 'text-emerald-300',
    activeBg: 'bg-emerald-500/20',
  },
  {
    href: '/pipeline',
    label: 'Pipeline',
    icon: '📊',
    color: 'from-amber-500 to-amber-600',
    activeText: 'text-amber-300',
    activeBg: 'bg-amber-500/20',
  },
]
 
export default function Sidebar() {
  const pathname = usePathname()
 
  return (
    <aside className="w-[220px] flex flex-col shrink-0 h-screen" style={{ background: '#0a0f1e' }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
            R
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Revenue OS</p>
            <p className="text-[10px] text-white/40 mt-0.5 leading-none">for Hireflow</p>
          </div>
        </div>
      </div>
 
      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? `${item.activeBg} ${item.activeText}`
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${
                active
                  ? `bg-gradient-to-br ${item.color} shadow-md`
                  : 'bg-white/10'
              }`}>
                {item.icon}
              </span>
              {item.label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-80" />
              )}
            </Link>
          )
        })}
      </nav>
 
      {/* Divider + shortcuts */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">Datenquellen</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[10px] text-white/40">Jobs · aktiv</p>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <p className="text-[10px] text-white/30">LinkedIn · pending</p>
          </div>
        </div>
      </div>
 
      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-[10px] text-white/20">Revenue OS v0.1 · Beta</p>
      </div>
    </aside>
  )
}
