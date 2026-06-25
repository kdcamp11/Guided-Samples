'use client'

import { useState, useEffect } from 'react'
import {
  LayoutDashboard, FolderOpen, Package, ShoppingCart, Library, Settings, Plus, ArrowRight, Save, KeyRound, LogOut, Sparkles, Loader2
} from 'lucide-react'
import { AppState } from '@/app/page'
import { useAuth } from '@/lib/auth'
import { useAICredits } from '@/lib/aiCreditsContext'
import { listAllUserAssets } from '@/lib/projects'
import SizingStudio from '@/components/sizing/SizingStudio'
import TechnicalDrawing from '@/components/TechnicalDrawing'
import ClientProductionTracker from '@/components/client/ClientProductionTracker'
import ClientOrderDetail from '@/components/client/ClientOrderDetail'
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
  if (section === 'sizeguide') return <SizingStudio />
  if (section === 'techdrawing') return <TechnicalDrawingSection state={state} />
  if (section === 'orders') return <Orders />
  if (section === 'library') return <LibraryView state={state} />
  if (section === 'settings') return <SettingsView />
  return null
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
  const { user } = useAuth()
  const [counts, setCounts] = useState({ logos: 0, artworks: 0, garments: 0, previews: 0 })
  const [countsLoaded, setCountsLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    listAllUserAssets(user.id).then(a => {
      setCounts({ logos: a.logos.length, artworks: a.artworks.length, garments: a.garments.length, previews: a.previews.length })
      setCountsLoaded(true)
    })
  }, [user])

  const stats = [
    { label: 'Logos', value: counts.logos },
    { label: 'Garments', value: counts.garments },
    { label: 'Artwork', value: counts.artworks },
    { label: 'Previews', value: counts.previews },
  ]
  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <Header icon={<LayoutDashboard size={20} />} title="Dashboard" subtitle="Overview of your design activity" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="card">
            <p className="text-3xl font-bold text-gray-900">{countsLoaded ? s.value : '—'}</p>
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
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
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

function Orders() {
  const { user, signOut } = useAuth()
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  if (!user) {
    return (
      <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
        <Header icon={<ShoppingCart size={20} />} title="Orders" subtitle="Production and sample orders" />
        <EmptyState icon={<ShoppingCart size={28} />} title="Sign in to view orders" subtitle="Your production and sample orders appear here once you're signed in." />
      </div>
    )
  }

  if (selectedOrderId) {
    return (
      <ClientOrderDetail
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
        embedded
      />
    )
  }

  return (
    <ClientProductionTracker
      userEmail={user.email}
      onSelectOrder={setSelectedOrderId}
      onSignOut={signOut}
      embedded
    />
  )
}

function LibraryView({ state: _state }: { state: AppState }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'logos' | 'artwork' | 'garments' | 'previews'>('logos')
  const [assets, setAssets] = useState<{ logos: string[]; artworks: string[]; garments: string[]; previews: string[] } | null>(null)
  const [loadingAssets, setLoadingAssets] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoadingAssets(true)
    listAllUserAssets(user.id).then(a => { setAssets(a); setLoadingAssets(false) })
  }, [user])

  const logos = assets?.logos ?? []
  const artworks = assets?.artworks ?? []
  const garments = assets?.garments ?? []
  const previews = assets?.previews ?? []

  const tabs = [
    { key: 'logos' as const, label: 'Logos', count: logos.length },
    { key: 'artwork' as const, label: 'Artwork', count: artworks.length },
    { key: 'garments' as const, label: 'Garments', count: garments.length },
    { key: 'previews' as const, label: 'Previews', count: previews.length },
  ]

  const currentAssets =
    tab === 'logos' ? logos :
    tab === 'artwork' ? artworks :
    tab === 'garments' ? garments :
    previews

  const handleDownload = async (src: string, index: number) => {
    const filename = `${tab}-${index + 1}.png`
    try {
      // Fetch as a blob so the download is forced even for cross-origin
      // (Supabase storage) URLs, where the `download` attribute is otherwise
      // ignored and the browser just navigates to the file.
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in a new tab if the fetch is blocked (e.g. CORS)
      window.open(src, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <Header icon={<Library size={20} />} title="Library" subtitle="All your AI-generated and uploaded assets" />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-grace-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand-green text-brand-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-grace-mist text-gray-500 text-[10px]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loadingAssets ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 size={20} className="animate-spin text-brand-green"/>
          <span className="text-sm">Loading library…</span>
        </div>
      ) : currentAssets.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {currentAssets.map((src, i) => (
            <div key={src} className="card group relative">
              <div className="checkerboard rounded-lg h-28 flex items-center justify-center mb-2 overflow-hidden">
                <img src={src} alt={`${tab} ${i + 1}`} className="w-full h-full object-contain p-2" />
              </div>
              <p className="text-[11px] text-gray-500 capitalize">{tab.slice(0, -1)} {i + 1}</p>
              <button
                onClick={() => handleDownload(src, i)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 bg-white/90 rounded text-[10px] text-gray-600 border border-grace-border hover:bg-grace-mist"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Library size={28} />}
          title={`No ${tab} yet`}
          subtitle={tab === 'logos' ? 'Generate or upload a logo in the Design Studio.' :
                    tab === 'artwork' ? 'Upload artwork in the Design Studio.' :
                    tab === 'garments' ? 'Upload or AI-generate a garment in the Design Studio.' :
                    'Generate a preview in the Preview in Reality phase.'}
        />
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
    <div className="p-4 md:p-6 max-w-[700px] mx-auto">
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

      {/* AI Credits / billing */}
      <CreditsCard />

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

// AI Credits summary on the Settings page — the persistent place to check
// balance and top up, complementing the in-flow GenerationCounter/paywall.
function CreditsCard() {
  const { freeUsed, freeLimit, creditBalance, spendCents, openPaywall, refreshCredits } = useAICredits()
  const freeRemaining = Math.max(0, freeLimit - freeUsed)
  const totalRemaining = freeRemaining + creditBalance

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={15} className="text-brand-green"/>
        <p className="text-sm font-semibold text-gray-900">AI Credits</p>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Pay-as-you-go — credits never expire. There is no recurring subscription.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-grace-mist p-3">
          <p className="text-2xl font-bold text-gray-900">{freeRemaining}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Free left ({freeUsed}/{freeLimit} used)</p>
        </div>
        <div className="rounded-xl bg-grace-mist p-3">
          <p className="text-2xl font-bold text-gray-900">{creditBalance}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Paid credits</p>
        </div>
        <div className="rounded-xl bg-grace-mist p-3">
          <p className="text-2xl font-bold text-gray-900">{totalRemaining}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Total generations</p>
        </div>
      </div>

      {spendCents > 0 && (
        <p className="text-[11px] text-gray-500 mb-3">
          ${(spendCents / 100).toFixed(2)} in credits purchased to date · applies toward your $25 production activation fee.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={openPaywall} className="btn-primary flex items-center gap-2">
          <Sparkles size={14}/> Buy more credits
        </button>
        <button onClick={refreshCredits} className="btn-secondary text-xs">Refresh</button>
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
