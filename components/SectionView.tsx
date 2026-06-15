'use client'

import { useState } from 'react'
import {
  LayoutDashboard, FolderOpen, Package, ShoppingCart, Library, Settings, Plus, ArrowRight, Save, KeyRound, LogOut
} from 'lucide-react'
import { AppState } from '@/app/page'
import { useAuth } from '@/lib/auth'
import SizeGuide from '@/components/SizeGuide'
import TechnicalDrawing from '@/components/TechnicalDrawing'
import TechPackExport from '@/components/TechPackExport'
import type { SizeGuideOverrides } from '@/lib/fitBlocks/sizeGuide'
import { resolveGarmentType } from '@/lib/fitBlocks'
import type { GarmentType } from '@/lib/fitBlocks/types'

interface Props {
  section: string
  state: AppState
  onStartDesign: () => void
}

export default function SectionView({ section, state, onStartDesign }: Props) {
  if (section === 'dashboard') return <Dashboard state={state} onStartDesign={onStartDesign} />
  if (section === 'projects') return <Projects state={state} onStartDesign={onStartDesign} />
  if (section === 'techpacks') return <TechPacksSection state={state} />
  if (section === 'sizeguide') return <SizeGuideSection state={state} />
  if (section === 'techdrawing') return <TechnicalDrawingSection state={state} />
  if (section === 'orders') return <Orders />
  if (section === 'library') return <LibraryView state={state} />
  if (section === 'settings') return <SettingsView />
  return null
}

// Size Guide section. Defaults to the garment the user is designing (if any).
// Consumer overrides persist for the session; technical specs stay hidden,
// surfacing only through tech pack generation.
function SizeGuideSection({ state }: { state: AppState }) {
  const [overrides, setOverrides] = useState<SizeGuideOverrides>({})
  const designed: GarmentType | undefined =
    (state.garment?.type ? resolveGarmentType(state.garment.type) ?? undefined : undefined)
  return (
    <SizeGuide
      garmentType={designed}
      overrides={overrides}
      onOverridesChange={setOverrides}
    />
  )
}

// Technical Drawing section. Reads ONLY getTechPackMeasurements() (via the drawing
// data layer), so hidden technical specs and any consumer edits both flow through,
// while consumer screens stay on the simplified guide. Renders the designed
// garment's logo into the placement boxes when one exists.
function TechnicalDrawingSection({ state }: { state: AppState }) {
  const designed: GarmentType | undefined =
    (state.garment?.type ? resolveGarmentType(state.garment.type) ?? undefined : undefined)
  return (
    <TechnicalDrawing
      garmentType={designed}
      artworkUrl={state.logo?.dataUrl ?? null}
    />
  )
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center text-brand-green">
        {icon}
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
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
    { label: 'Previews', value: state.preview ? 1 : 0 },
  ]
  return (
    <div className="p-4 md:p-6 max-w-[1100px]">
      <Header icon={<LayoutDashboard size={20} />} title="Dashboard" subtitle="Overview of your design activity" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="card">
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Start a new design</p>
          <p className="text-xs text-gray-500 mt-0.5">Generate a logo, build a garment, and create a tech pack.</p>
        </div>
        <button onClick={onStartDesign} className="btn-primary flex items-center gap-2 shrink-0">
          New Design <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

function Projects({ state, onStartDesign }: { state: AppState; onStartDesign: () => void }) {
  const hasProject = state.logo || state.garment || state.design
  return (
    <div className="p-4 md:p-6 max-w-[1100px]">
      <Header icon={<FolderOpen size={20} />} title="Projects" subtitle="Your saved design projects" />
      {hasProject ? (
        <div className="card flex items-center gap-4">
          <div className="checkerboard rounded-lg w-16 h-16 md:w-20 md:h-20 flex items-center justify-center shrink-0">
            {state.logo ? (
              <img src={state.logo.dataUrl} alt="logo" className="w-full h-full object-contain p-2" />
            ) : <Package size={24} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">GRACE Project</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {[state.logo && 'Logo', state.garment && 'Garment', state.design && 'Design'].filter(Boolean).join(' · ') || 'In progress'}
            </p>
          </div>
          <button onClick={onStartDesign} className="btn-secondary shrink-0">Open</button>
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

// Tech Pack Export section. Sources measurements, callouts, and placements from
// getTechnicalDrawingData() (via buildTechPackDocument) — no sizing logic here and
// no reads from the consumer size guide. Defaults to the garment being designed
// and seeds style metadata from it.
function TechPacksSection({ state }: { state: AppState }) {
  const designed: GarmentType | undefined =
    (state.garment?.type ? resolveGarmentType(state.garment.type) ?? undefined : undefined)
  const meta = {
    brand: 'GRACE',
    season: 'FW25',
    revision: 'A',
  }
  return <TechPackExport garmentType={designed} meta={meta} />
}

function Orders() {
  return (
    <div className="p-4 md:p-6 max-w-[1100px]">
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
    <div className="p-4 md:p-6 max-w-[1100px]">
      <Header icon={<Library size={20} />} title="Library" subtitle="Your reusable logos and garments" />
      {assets.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {assets.map(a => (
            <div key={a.label} className="card">
              <div className="checkerboard rounded-lg h-28 flex items-center justify-center mb-2">
                <img src={a.src} alt={a.label} className="w-full h-full object-contain p-2" />
              </div>
              <p className="text-xs text-gray-600">{a.label}</p>
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
  const { user, updateUser, signOut } = useAuth()
  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    brandName: user?.brandName ?? '',
  })
  const [profileSaved, setProfileSaved] = useState(false)

  const handleProfileSave = () => {
    updateUser(profile)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2500)
  }

  return (
    <div className="p-4 md:p-6 max-w-[700px]">
      <Header icon={<Settings size={20} />} title="Settings" subtitle="Manage your account and preferences" />

      {/* Profile */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-brand-green rounded-full flex items-center justify-center text-lg font-bold text-white">
            {user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'GB'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="Full Name" value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} />
          <Field label="Brand Name" value={profile.brandName} onChange={v => setProfile(p => ({ ...p, brandName: v }))} />
        </div>

        <button onClick={handleProfileSave} className="btn-primary flex items-center gap-2">
          <Save size={14}/>
          {profileSaved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Password reset via email */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={15} className="text-gray-500"/>
          <p className="text-sm font-semibold text-gray-900">Password</p>
        </div>
        <p className="text-xs text-gray-500 mb-3">To change your password, use the "Forgot password" flow on the sign-in page.</p>
      </div>

      {/* Sign out */}
      <div className="card">
        <p className="text-sm font-semibold text-gray-900 mb-1">Sign Out</p>
        <p className="text-xs text-gray-500 mb-4">You will be returned to the sign-in screen.</p>
        <button onClick={signOut} className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors">
          <LogOut size={14}/> Sign out
        </button>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <input
        className="input-field"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function EmptyState({ icon, title, subtitle, action, onAction }: {
  icon: React.ReactNode; title: string; subtitle?: string; action?: string; onAction?: () => void
}) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-16">
      <div className="text-gray-300 mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1 max-w-xs">{subtitle}</p>}
      {action && onAction && (
        <button onClick={onAction} className="btn-primary mt-4 flex items-center gap-2">
          <Plus size={14} /> {action}
        </button>
      )}
    </div>
  )
}
