'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { useAICredits } from '@/lib/aiCreditsContext'
import type { AppState } from '@/app/page'
import {
  LayoutDashboard, FolderOpen, Palette,
  ShoppingCart, Library, Settings, ChevronRight, X, ArrowRight, Ruler, Sparkles,
  Package, CheckCircle2, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'

interface Props {
  section: string
  onSectionChange: (section: string) => void
  mobileOpen: boolean
  onMobileClose: () => void
  onExpertHelp?: () => void
  onSignIn?: () => void
  currentPhase?: number
  onPhaseChange?: (phase: number) => void
  state?: AppState
}

const phases = [
  { num: 1, label: 'Product Selection' },
  { num: 2, label: 'Studio' },
  { num: 3, label: 'Preview' },
  { num: 4, label: 'Tech Pack' },
]

function GraceMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="GRACE mark">
      <circle cx="24" cy="24" r="23" stroke="#0A0A0A" strokeWidth="2.5"/>
      <circle cx="24" cy="24" r="7" fill="#C8372D"/>
    </svg>
  )
}

export default function Sidebar({ section, onSectionChange, mobileOpen, onMobileClose, onExpertHelp, onSignIn, currentPhase, onPhaseChange, state }: Props) {
  const { user, signOut } = useAuth() ?? {}
  const { freeUsed, freeLimit, creditBalance } = useAICredits()
  const generationsLeft = Math.max(0, freeLimit - freeUsed) + creditBalance

  // Desktop collapse — persisted so the choice survives reloads.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem('grace-sidebar-collapsed') === '1') setCollapsed(true)
    } catch {}
  }, [])
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c
    try { localStorage.setItem('grace-sidebar-collapsed', next ? '1' : '0') } catch {}
    return next
  })

  const isPhaseComplete = (num: number): boolean => {
    if (!state) return false
    if (num === 1) return !!state.garment
    if (num === 2) return !!state.design
    if (num === 3) return !!state.preview
    return false
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'GU'

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-30 bg-white border-r border-grace-border flex flex-col
      transform transition-all duration-200 ease-in-out
      lg:relative lg:translate-x-0 lg:z-auto
      ${collapsed ? 'w-56 lg:w-16' : 'w-56'}
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Brand */}
      <div className={`p-4 border-b border-grace-border flex items-center ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
        <button
          onClick={() => onSectionChange('dashboard')}
          className="flex items-center gap-2.5 hover:opacity-70 transition-opacity"
          title="Go to Dashboard"
        >
          <GraceMark size={26}/>
          <div className={`text-left ${collapsed ? 'lg:hidden' : ''}`}>
            <div className="text-xs font-black text-grace-ink leading-none tracking-widest uppercase">GRACE</div>
            <div className="text-[9px] text-grace-stone tracking-[0.2em] uppercase">Enterprise</div>
          </div>
        </button>
        <button onClick={onMobileClose} className="lg:hidden p-1 rounded-lg hover:bg-grace-mist text-grace-stone">
          <X size={15}/>
        </button>
        {/* Desktop collapse toggle */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex p-1 rounded-lg hover:bg-grace-mist text-grace-stone ${collapsed ? 'lg:hidden' : ''}`}
        >
          <PanelLeftClose size={15}/>
        </button>
      </div>

      {/* Expand button shown when collapsed */}
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          title="Expand sidebar"
          className="hidden lg:flex items-center justify-center py-2 border-b border-grace-border text-grace-stone hover:bg-grace-mist"
        >
          <PanelLeftOpen size={15}/>
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        <NavItem icon={<LayoutDashboard size={14}/>} label="Dashboard" active={section === 'dashboard'} onClick={() => onSectionChange('dashboard')} collapsed={collapsed} />
        <NavItem icon={<FolderOpen size={14}/>} label="Projects" active={section === 'projects'} onClick={() => onSectionChange('projects')} collapsed={collapsed} />
        <NavItem icon={<Ruler size={14}/>} label="Size Guide" active={section === 'sizeguide'} onClick={() => onSectionChange('sizeguide')} collapsed={collapsed} />
        <NavItem icon={<ShoppingCart size={14}/>} label="Orders" active={section === 'orders'} onClick={() => onSectionChange('orders')} collapsed={collapsed} />
        <NavItem icon={<Library size={14}/>} label="Library" active={section === 'library'} onClick={() => onSectionChange('library')} collapsed={collapsed} />
        <NavItem icon={<Settings size={14}/>} label="Settings" active={section === 'settings'} onClick={() => onSectionChange('settings')} collapsed={collapsed} />

        {/* AI credit balance — persistent, links to Settings to top up */}
        <button
          onClick={() => onSectionChange('settings')}
          className={`w-full mt-2 flex items-center gap-2 rounded-lg border border-grace-border hover:border-brand-green hover:bg-brand-green/5 transition-colors ${collapsed ? 'lg:justify-center lg:px-0 px-2.5 py-2' : 'px-2.5 py-2'}`}
          title={collapsed ? `AI credits: ${generationsLeft}` : 'Manage AI credits'}
        >
          <Sparkles size={13} className="text-brand-green shrink-0"/>
          <span className={`text-[11px] text-grace-stone flex-1 text-left ${collapsed ? 'lg:hidden' : ''}`}>AI credits</span>
          <span className={`text-[11px] font-bold ${generationsLeft > 0 ? 'text-grace-ink' : 'text-red-500'} ${collapsed ? 'lg:hidden' : ''}`}>{generationsLeft}</span>
        </button>

        {/* Workflow — jump between design phases; navigation autosaves progress */}
        {onPhaseChange && (
          <div className="mt-5">
            <p className={`px-2 mb-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-grace-stone flex items-center gap-1.5 ${collapsed ? 'lg:justify-center' : ''}`}>
              <Package size={11}/> <span className={collapsed ? 'lg:hidden' : ''}>Workflow</span>
            </p>
            <div className="space-y-0.5">
              {phases.map(p => {
                const active = section === 'design' && currentPhase === p.num
                const done = isPhaseComplete(p.num)
                return (
                  <button
                    key={p.num}
                    onClick={() => onPhaseChange(p.num)}
                    title={collapsed ? p.label : undefined}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${collapsed ? 'lg:justify-center' : ''} ${
                      active ? 'bg-grace-mist text-grace-ink font-semibold' : 'text-grace-stone hover:bg-grace-mist hover:text-grace-ink'
                    }`}
                  >
                    {done
                      ? <CheckCircle2 size={13} className="text-brand-green shrink-0"/>
                      : <span className="w-[7px] h-[7px] rounded-full border border-grace-border shrink-0"/>}
                    <span className={`flex-1 text-left ${collapsed ? 'lg:hidden' : ''}`}>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Expert help — visible in nav, not buried at bottom */}
        {onExpertHelp && !collapsed && (
          <div className="mt-5 p-3 rounded-xl border border-grace-border bg-grace-mist">
            <p className="text-[9px] font-bold tracking-[0.18em] uppercase text-grace-stone mb-0.5">Need help?</p>
            <p className="text-[11px] font-bold text-grace-ink leading-tight mb-2">Work with GRACE Studios</p>
            <button
              onClick={onExpertHelp}
              className="w-full flex items-center justify-center gap-1 py-1.5 px-3 rounded-full bg-grace-ink text-white text-[9px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
            >
              Talk to an Expert <ArrowRight size={9}/>
            </button>
          </div>
        )}
        {/* Collapsed expert-help shortcut */}
        {onExpertHelp && collapsed && (
          <button
            onClick={onExpertHelp}
            title="Talk to an Expert"
            className="hidden lg:flex w-full mt-5 items-center justify-center py-2 rounded-lg bg-grace-ink text-white hover:bg-zinc-800 transition-colors"
          >
            <ArrowRight size={13}/>
          </button>
        )}

      </nav>

      {/* User */}
      <div className="p-3 border-t border-grace-border space-y-1">
        <button
          onClick={() => (user ? onSectionChange('settings') : onSignIn?.())}
          title={collapsed ? (user?.name ?? 'Sign in') : undefined}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-grace-mist transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
        >
          <div className="w-6 h-6 bg-grace-ink rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0">{initials}</div>
          <span className={`text-xs text-grace-stone flex-1 text-left truncate ${collapsed ? 'lg:hidden' : ''}`}>{user?.name ?? 'Guest'}</span>
          <ChevronRight size={11} className={`text-grace-stone shrink-0 ${collapsed ? 'lg:hidden' : ''}`}/>
        </button>
        {user ? (
          <button
            onClick={signOut}
            title={collapsed ? 'Sign out' : undefined}
            className={`w-full px-2 py-1 text-[10px] text-grace-stone hover:text-grace-ink transition-colors rounded-lg hover:bg-grace-mist tracking-widest uppercase ${collapsed ? 'lg:hidden' : 'text-left'}`}
          >
            Sign out
          </button>
        ) : onSignIn ? (
          <button
            onClick={onSignIn}
            title={collapsed ? 'Sign in' : undefined}
            className={`w-full px-2 py-1 text-[10px] font-bold text-grace-ink hover:text-grace-ink transition-colors rounded-lg hover:bg-grace-mist tracking-widest uppercase ${collapsed ? 'lg:hidden' : 'text-left'}`}
          >
            Sign in
          </button>
        ) : null}
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick, href, collapsed }: {
  icon: React.ReactNode; label: string; active: boolean; onClick?: () => void; href?: string; collapsed?: boolean
}) {
  const cls = `w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors font-medium ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
    active ? 'bg-grace-mist text-grace-ink' : 'text-grace-stone hover:bg-grace-mist hover:text-grace-ink'
  }`
  if (href) {
    return (
      <a href={href} className={cls} title={collapsed ? label : undefined}>
        {icon}
        <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
      </a>
    )
  }
  return (
    <button onClick={onClick} className={cls} title={collapsed ? label : undefined}>
      {icon}
      <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
    </button>
  )
}
