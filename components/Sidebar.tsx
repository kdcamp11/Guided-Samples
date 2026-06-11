'use client'

import { AppState } from '@/app/page'
import {
  LayoutDashboard, FolderOpen, Palette, Package,
  ShoppingCart, Library, Settings, ChevronRight, CheckCircle2
} from 'lucide-react'

interface Props {
  currentPhase: number
  onPhaseChange: (phase: number) => void
  state: AppState
  section: string
  onSectionChange: (section: string) => void
}

const phases = [
  { id: 1, label: 'Logo Generation', desc: 'AI-powered logo creation' },
  { id: 2, label: 'Garment', desc: 'Upload or generate blank' },
  { id: 3, label: 'Apply Design', desc: 'Position your logo' },
  { id: 4, label: 'Tech Pack', desc: 'Specs & measurements' },
]

export default function Sidebar({ currentPhase, onPhaseChange, state, section, onSectionChange }: Props) {
  // No barriers — every phase is freely navigable at any time.
  const isPhaseUnlocked = (_phase: number) => true

  const isPhaseComplete = (phase: number) => {
    if (phase === 1) return !!state.logo
    if (phase === 2) return !!state.garment
    if (phase === 3) return !!state.design
    return false
  }

  return (
    <aside className="w-56 bg-dark-800 border-r border-dark-600 flex flex-col shrink-0">
      {/* Brand */}
      <div className="p-4 border-b border-dark-600">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-7 h-7 bg-brand-green rounded-md flex items-center justify-center text-xs font-bold text-white">G</div>
          <div>
            <div className="text-sm font-bold text-white leading-none">GRACE</div>
            <div className="text-[10px] text-gray-500 tracking-widest">ENTERPRISE</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavItem icon={<LayoutDashboard size={15}/>} label="Dashboard" active={section === 'dashboard'} onClick={() => onSectionChange('dashboard')} />
        <NavItem icon={<FolderOpen size={15}/>} label="Projects" active={section === 'projects'} onClick={() => onSectionChange('projects')} />
        <NavItem icon={<Palette size={15}/>} label="Logo & Design" active={section === 'design'} onClick={() => onSectionChange('design')} />
        <NavItem icon={<Package size={15}/>} label="Tech Packs" active={section === 'techpacks'} onClick={() => onSectionChange('techpacks')} />
        <NavItem icon={<ShoppingCart size={15}/>} label="Orders" active={section === 'orders'} onClick={() => onSectionChange('orders')} />
        <NavItem icon={<Library size={15}/>} label="Library" active={section === 'library'} onClick={() => onSectionChange('library')} />
        <NavItem icon={<Settings size={15}/>} label="Settings" active={section === 'settings'} onClick={() => onSectionChange('settings')} />

        {/* Phase progress */}
        <div className="pt-4 pb-1">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-2 mb-2">Workflow</p>
          <div className="space-y-0.5">
            {phases.map(phase => {
              const unlocked = isPhaseUnlocked(phase.id)
              const complete = isPhaseComplete(phase.id)
              const active = currentPhase === phase.id
              return (
                <button
                  key={phase.id}
                  onClick={() => unlocked && onPhaseChange(phase.id)}
                  disabled={!unlocked}
                  className={`w-full text-left px-2 py-2 rounded-lg transition-colors text-xs flex items-center gap-2 ${
                    active
                      ? 'bg-brand-green text-white'
                      : unlocked
                      ? 'text-gray-400 hover:bg-dark-600 hover:text-white'
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                    complete ? 'border-brand-green bg-brand-green text-white' :
                    active ? 'border-white text-white' :
                    unlocked ? 'border-gray-500 text-gray-500' : 'border-gray-700 text-gray-700'
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
      <div className="p-3 border-t border-dark-600">
        <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dark-600 transition-colors">
          <div className="w-6 h-6 bg-brand-green rounded-full flex items-center justify-center text-[10px] font-bold text-white">GB</div>
          <span className="text-xs text-gray-300 flex-1 text-left truncate">Grace Brand</span>
          <ChevronRight size={12} className="text-gray-500"/>
        </button>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors ${
        active ? 'bg-dark-600 text-white' : 'text-gray-500 hover:bg-dark-600 hover:text-gray-300'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
