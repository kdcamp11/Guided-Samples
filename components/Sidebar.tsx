'use client'

import { AppState } from '@/app/page'
import { useAuth } from '@/lib/auth'
import {
  LayoutDashboard, FolderOpen, Palette, Package,
  ShoppingCart, Library, Settings, ChevronRight, CheckCircle2, X, ArrowRight, Ruler, PenTool
} from 'lucide-react'

interface Props {
  currentPhase: number
  onPhaseChange: (phase: number) => void
  state: AppState
  section: string
  onSectionChange: (section: string) => void
  mobileOpen: boolean
  onMobileClose: () => void
  onExpertHelp?: () => void
}

const phases = [
  { id: 1, label: 'Logo Generation', desc: 'AI-powered logo creation' },
  { id: 2, label: 'Garment', desc: 'Upload or generate blank' },
  { id: 3, label: 'Apply Design', desc: 'Position your logo' },
  { id: 4, label: 'Preview in Reality', desc: 'Visualize finished product' },
  { id: 5, label: 'Tech Pack', desc: 'Specs & measurements' },
]

function GraceMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="GRACE mark">
      <circle cx="24" cy="24" r="23" stroke="#0A0A0A" strokeWidth="2.5"/>
      <circle cx="24" cy="24" r="7" fill="#C8372D"/>
    </svg>
  )
}

export default function Sidebar({ currentPhase, onPhaseChange, state, section, onSectionChange, mobileOpen, onMobileClose, onExpertHelp }: Props) {
  const { user, signOut } = useAuth() ?? {}

  const isPhaseComplete = (phase: number) => {
    if (phase === 1) return !!state.logo
    if (phase === 2) return !!state.garment
    if (phase === 3) return !!state.design
    if (phase === 4) return !!state.preview
    return false
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'GB'

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-grace-border flex flex-col
      transform transition-transform duration-200 ease-in-out
      lg:relative lg:translate-x-0 lg:z-auto
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Brand */}
      <div className="p-4 border-b border-grace-border flex items-center justify-between">
        <button
          onClick={() => onSectionChange('dashboard')}
          className="flex items-center gap-2.5 hover:opacity-70 transition-opacity"
          title="Go to Dashboard"
        >
          <GraceMark size={26}/>
          <div className="text-left">
            <div className="text-xs font-black text-grace-ink leading-none tracking-widest uppercase">GRACE</div>
            <div className="text-[9px] text-grace-stone tracking-[0.2em] uppercase">Enterprise</div>
          </div>
        </button>
        <button onClick={onMobileClose} className="lg:hidden p-1 rounded-lg hover:bg-grace-mist text-grace-stone">
          <X size={15}/>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavItem icon={<LayoutDashboard size={14}/>} label="Dashboard" active={section === 'dashboard'} onClick={() => onSectionChange('dashboard')} />
        <NavItem icon={<FolderOpen size={14}/>} label="Projects" active={section === 'projects'} onClick={() => onSectionChange('projects')} />
        <NavItem icon={<Palette size={14}/>} label="Logo & Design" active={section === 'design'} onClick={() => onSectionChange('design')} />
        <NavItem icon={<Package size={14}/>} label="Tech Packs" active={section === 'techpacks'} onClick={() => onSectionChange('techpacks')} />
        <NavItem icon={<Ruler size={14}/>} label="Size Guide" active={section === 'sizeguide'} onClick={() => onSectionChange('sizeguide')} />
        <NavItem icon={<PenTool size={14}/>} label="Technical Drawing" active={section === 'techdrawing'} onClick={() => onSectionChange('techdrawing')} />
        <NavItem icon={<ShoppingCart size={14}/>} label="Orders" active={section === 'orders'} href="/track" />
        <NavItem icon={<Library size={14}/>} label="Library" active={section === 'library'} onClick={() => onSectionChange('library')} />
        <NavItem icon={<Settings size={14}/>} label="Settings" active={section === 'settings'} onClick={() => onSectionChange('settings')} />

        {/* Phase progress */}
        <div className="pt-5 pb-1">
          <p className="text-[9px] font-bold text-grace-stone uppercase tracking-[0.2em] px-2 mb-2">Workflow</p>
          <div className="space-y-0.5">
            {phases.map(phase => {
              const complete = isPhaseComplete(phase.id)
              const active = currentPhase === phase.id
              return (
                <button
                  key={phase.id}
                  onClick={() => onPhaseChange(phase.id)}
                  className={`w-full text-left px-2 py-2 rounded-lg transition-colors text-xs flex items-center gap-2 ${
                    active
                      ? 'bg-grace-ink text-white'
                      : 'text-grace-stone hover:bg-grace-mist hover:text-grace-ink'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                    complete ? 'border-grace-ink bg-grace-ink text-white' :
                    active ? 'border-white text-white' :
                    'border-grace-border text-grace-stone'
                  }`}>
                    {complete ? <CheckCircle2 size={11}/> : phase.id}
                  </span>
                  <span className="truncate font-medium">{phase.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Expert help upsell */}
      {onExpertHelp && (
        <div className="mx-3 mb-3 p-3 rounded-xl border border-grace-border bg-grace-mist">
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

      {/* User */}
      <div className="p-3 border-t border-grace-border space-y-1">
        <button
          onClick={() => onSectionChange('settings')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-grace-mist transition-colors"
        >
          <div className="w-6 h-6 bg-grace-ink rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0">{initials}</div>
          <span className="text-xs text-grace-stone flex-1 text-left truncate">{user?.name ?? 'Grace Brand'}</span>
          <ChevronRight size={11} className="text-grace-stone shrink-0"/>
        </button>
        <button
          onClick={signOut}
          className="w-full text-left px-2 py-1 text-[10px] text-grace-stone hover:text-grace-ink transition-colors rounded-lg hover:bg-grace-mist tracking-widest uppercase"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick, href }: {
  icon: React.ReactNode; label: string; active: boolean; onClick?: () => void; href?: string
}) {
  const cls = `w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors font-medium ${
    active ? 'bg-grace-mist text-grace-ink' : 'text-grace-stone hover:bg-grace-mist hover:text-grace-ink'
  }`
  if (href) {
    return (
      <a href={href} className={cls}>
        {icon}
        <span>{label}</span>
      </a>
    )
  }
  return (
    <button onClick={onClick} className={cls}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
