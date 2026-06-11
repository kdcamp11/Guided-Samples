'use client'

import {
  LayoutDashboard, FolderOpen, Package, ShoppingCart, Library, Settings, Plus, ArrowRight
} from 'lucide-react'
import { AppState } from '@/app/page'

interface Props {
  section: string
  state: AppState
  onStartDesign: () => void
}

export default function SectionView({ section, state, onStartDesign }: Props) {
  if (section === 'dashboard') return <Dashboard state={state} onStartDesign={onStartDesign} />
  if (section === 'projects') return <Projects state={state} onStartDesign={onStartDesign} />
  if (section === 'techpacks') return <TechPacks state={state} />
  if (section === 'orders') return <Orders />
  if (section === 'library') return <LibraryView state={state} />
  if (section === 'settings') return <SettingsView />
  return null
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-green/15 flex items-center justify-center text-brand-green">
        {icon}
      </div>
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-gray-500 text-sm">{subtitle}</p>
      </div>
    </div>
  )
}

function Dashboard({ state, onStartDesign }: { state: AppState; onStartDesign: () => void }) {
  const stats = [
    { label: 'Logos Created', value: state.logo ? 1 : 0 },
    { label: 'Garments', value: state.garment ? 1 : 0 },
    { label: 'Designs', value: state.design ? 1 : 0 },
    { label: 'Tech Packs', value: state.design ? 1 : 0 },
  ]
  return (
    <div className="p-6 max-w-[1100px]">
      <Header icon={<LayoutDashboard size={20} />} title="Dashboard" subtitle="Overview of your design activity" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="card">
            <p className="text-3xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Start a new design</p>
          <p className="text-xs text-gray-500 mt-0.5">Generate a logo, build a garment, and create a tech pack.</p>
        </div>
        <button onClick={onStartDesign} className="btn-primary flex items-center gap-2">
          New Design <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

function Projects({ state, onStartDesign }: { state: AppState; onStartDesign: () => void }) {
  const hasProject = state.logo || state.garment || state.design
  return (
    <div className="p-6 max-w-[1100px]">
      <Header icon={<FolderOpen size={20} />} title="Projects" subtitle="Your saved design projects" />
      {hasProject ? (
        <div className="card flex items-center gap-4">
          <div className="checkerboard rounded-lg w-20 h-20 flex items-center justify-center shrink-0">
            {state.logo ? (
              <img src={state.logo.dataUrl} alt="logo" className="w-full h-full object-contain p-2" />
            ) : <Package size={24} className="text-gray-600" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">GRACE Project</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {[state.logo && 'Logo', state.garment && 'Garment', state.design && 'Design'].filter(Boolean).join(' · ') || 'In progress'}
            </p>
          </div>
          <button onClick={onStartDesign} className="btn-secondary">Open</button>
        </div>
      ) : (
        <EmptyState
          icon={<FolderOpen size={28} />}
          title="No projects yet"
          action="Start designing"
          onAction={onStartDesign}
        />
      )}
    </div>
  )
}

function TechPacks({ state }: { state: AppState }) {
  return (
    <div className="p-6 max-w-[1100px]">
      <Header icon={<Package size={20} />} title="Tech Packs" subtitle="Specification sheets for manufacturing" />
      {state.design ? (
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">GRACE HOODIE — GRH-001</p>
            <p className="text-xs text-gray-500 mt-0.5">FW25 · Revision A</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-brand-green/15 text-brand-green">Ready</span>
        </div>
      ) : (
        <EmptyState icon={<Package size={28} />} title="No tech packs yet" subtitle="Complete a design to generate a tech pack." />
      )}
    </div>
  )
}

function Orders() {
  return (
    <div className="p-6 max-w-[1100px]">
      <Header icon={<ShoppingCart size={20} />} title="Orders" subtitle="Production and sample orders" />
      <EmptyState icon={<ShoppingCart size={28} />} title="No orders yet" subtitle="Submit a tech pack to a manufacturer to place an order." />
    </div>
  )
}

function LibraryView({ state }: { state: AppState }) {
  const assets = [
    state.logo && { label: 'GRACE_logo', src: state.logo.dataUrl },
    state.garment && { label: 'GRACE_garment', src: state.garment.dataUrl },
  ].filter(Boolean) as { label: string; src: string }[]
  return (
    <div className="p-6 max-w-[1100px]">
      <Header icon={<Library size={20} />} title="Library" subtitle="Your reusable logos and garments" />
      {assets.length > 0 ? (
        <div className="grid grid-cols-4 gap-4">
          {assets.map(a => (
            <div key={a.label} className="card">
              <div className="checkerboard rounded-lg h-28 flex items-center justify-center mb-2">
                <img src={a.src} alt={a.label} className="w-full h-full object-contain p-2" />
              </div>
              <p className="text-xs text-gray-400">{a.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Library size={28} />} title="Library is empty" subtitle="Create a logo or garment to save it here." />
      )}
    </div>
  )
}

function SettingsView() {
  return (
    <div className="p-6 max-w-[700px]">
      <Header icon={<Settings size={20} />} title="Settings" subtitle="Workspace preferences" />
      <div className="card space-y-4">
        <Field label="Brand Name" value="GRACE" />
        <Field label="Workspace" value="Keith Camp's projects" />
        <Field label="Plan" value="Hobby" />
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Default Logo Color</label>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg" style={{ background: '#184D3E' }} />
            <span className="text-sm text-gray-300 font-mono">#184D3E</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <input className="input-field" defaultValue={value} />
    </div>
  )
}

function EmptyState({ icon, title, subtitle, action, onAction }: {
  icon: React.ReactNode; title: string; subtitle?: string; action?: string; onAction?: () => void
}) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-16">
      <div className="text-gray-600 mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {subtitle && <p className="text-xs text-gray-600 mt-1 max-w-xs">{subtitle}</p>}
      {action && onAction && (
        <button onClick={onAction} className="btn-primary mt-4 flex items-center gap-2">
          <Plus size={14} /> {action}
        </button>
      )}
    </div>
  )
}
