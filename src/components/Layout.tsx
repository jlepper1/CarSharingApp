import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Kalender', icon: '📅', end: true },
  { to: '/fahrten', label: 'Fahrten', icon: '🚗', end: false },
  { to: '/kosten', label: 'Kosten', icon: '🧾', end: false },
  { to: '/abrechnung', label: 'Abrechnung', icon: '⚖️', end: false },
  { to: '/einstellungen', label: 'Mehr', icon: '⚙️', end: false },
]

/** App shell: scrolling content above a fixed bottom tab bar. */
export default function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom">
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-brand-700' : 'text-slate-500'
                  }`
                }
              >
                <span aria-hidden className="text-lg leading-none">
                  {tab.icon}
                </span>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
