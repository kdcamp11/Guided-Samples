'use client'

import { AppState } from '@/app/page'
import { useAuth } from '@/lib/auth'
import {
  LayoutDashboard, FolderOpen, Palette, Package,
  ShoppingCart, Library, Settings, ChevronRight, CheckCircle2, X
} from 'lucide-react'

interface Props {
  currentPhase: number
  onPhaseChange: (phase: number) => void
  state: AppState
  section: string
  onSectionChange: (section: string) => void
  mobileOpen: boolean
  onMobileClose: () => void
}

const phases = [
  { id: 1, label: 'Logo Generation', desc: 'AI-powered logo creation' },
  { id: 2, label: 'Garment', desc: 'Upload or generate blank' },
  { id: 3, label: 'Apply Design', desc: 'Position your logo' },
  { id: 4, label: 'Preview in Reality', desc: 'Visualize finished product' },
  { id: 5, label: 'Tech Pack', desc: 'Specs & measurements' },
]

export default function Sidebar({ currentPhase, onPhaseChange, state, section, onSectionChange, mobileOpen, onMobileClose }: Props) {
  // Auth disabled — useAuth may return null user while sign-in is commented out
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
      fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-slate-200 flex flex-col
      transform transition-transform duration-200 ease-in-out
      lg:relative lg:translate-x-0 lg:z-auto
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Brand */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-green rounded-md flex items-center justify-center text-xs font-bold text-white">G</div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-none">GRACE</div>
            <div className="text-[10px] text-gray-400 tracking-widest">ENTERPRISE</div>
          </div>
        </div>
        <button onClick={onMobileClose} className="lg:hidden p-1 rounded-lg hover:bg-slate-100 text-gray-400">
          <X size={16}/>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavItem icon={<LayoutDashboard size={15}/>} label="Dashboard" active={section === 'dashboard'} onClick={() => onSectionChange('dashboard')} />
        <NavItem icon={<FolderOpen size={15}/>} label="Projects" active={section === 'projects'} onClick={() => onSectionChange('projects')} />
        <NavItem icon={<Palette size={15}/>} label="Logo & Design" active={section === 'design'} onClick={() => onSectionChange('design')} />
        <NavItem icon={<Package size={15}/>} label="Tech Packs" active={section === 'techpacks'} onClick={() => onSectionChange('techpacks')} />
        <NavItem icon={<ShoppingCart size={15}/>} label="Orders" active={section === 'orders'} href="/track" />
        <NavItem icon={<Library size={15}/>} label="Library" active={section === 'library'} onClick={() => onSectionChange('library')} />
        <NavItem icon={<Settings size={15}/>} label="Settings" active={section === 'settings'} onClick={() => onSectionChange('settings')} />

        {/* Phase progress */}
        <div className="pt-4 pb-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2 mb-2">Workflow</p>
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
                      ? 'bg-brand-green text-white'
                      : 'text-gray-500 hover:bg-slate-100 hover:text-gray-900'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                    complete ? 'border-brand-green bg-brand-green text-white' :
                    active ? 'border-white text-white' :
                    'border-gray-300 text-gray-500'
                  }`}>
                    {complete ? <CheckCircle2 size={12}/> : phase.id}
                  </span>
                  <span className="truncate">{phase.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-200 space-y-1">
        <button
          onClick={() => onSectionChange('settings')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="w-6 h-6 bg-brand-green rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0">{initials}</div>
          <span className="text-xs text-gray-600 flex-1 text-left truncate">{user?.name ?? 'Grace Brand'}</span>
          <ChevronRight size={12} className="text-gray-400 shrink-0"/>
        </button>
        <button
          onClick={signOut}
          className="w-full text-left px-2 py-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-slate-50"
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
  const cls = `w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors ${
    active ? 'bg-slate-100 text-gray-900' : 'text-gray-500 hover:bg-slate-50 hover:text-gray-700'
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
