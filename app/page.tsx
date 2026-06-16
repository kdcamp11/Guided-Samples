'use client'

import { useState, useRef } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { saveProject, saveTechPack, loadProject } from '@/lib/projects'
import type { ProjectDetail } from '@/lib/projects'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SignIn from '@/components/SignIn'
import AuthModal from '@/components/AuthModal'
import ProjectsDashboard from '@/components/ProjectsDashboard'
import Phase1Logo from '@/components/Phase1Logo'
import Phase2Garment from '@/components/Phase2Garment'
import Phase3Editor from '@/components/Phase3Editor'
import Phase4Preview from '@/components/Phase4Preview'
import Phase5TechPack from '@/components/Phase5TechPack'
import Phase6Production from '@/components/Phase6Production'
import type { TechPackData } from '@/components/Phase6Production'
import SectionView from '@/components/SectionView'
import LandingPage from '@/components/LandingPage'
import CreativeDirectionForm from '@/components/CreativeDirectionForm'
import AIPaywallModal from '@/components/AIPaywallModal'
import { AICreditsProvider, useAICredits } from '@/lib/aiCreditsContext'
import { Menu, Sparkles } from 'lucide-react'

export type AppState = {
  currentPhase: number
  logo: {
    svg: string
    dataUrl: string
    style: string
    color: string
  } | null
  garment: {
    svg: string
    dataUrl: string
    views: { front?: string; back?: string; side?: string }
    type: string
    color: string
    mode?: 'apparel' | 'uniform'
    sport?: string
    uniformType?: string
  } | null
  design: {
    confirmed: boolean
    previewDataUrl: string
  } | null
  preview: {
    images: string[]
  } | null
}

const EMPTY_STATE: AppState = {
  currentPhase: 1,
  logo: null,
  garment: null,
  design: null,
  preview: null,
}

function App() {
  const { user, loading } = useAuth()
  const { refreshCredits, freeUsed, freeLimit, creditBalance } = useAICredits()
  const generationsLeft = Math.max(0, freeLimit - freeUsed) + creditBalance
  // Allow deep-linking straight to the studio dashboard (e.g. the "home" link
  // from the /track orders page) via /?view=studio.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const initialView = params?.get('view') === 'studio' ? 'studio' as const : 'landing' as const
  // Refresh credits when returning from a Stripe credit-purchase session
  if (params?.get('credits_added') && typeof window !== 'undefined') {
    refreshCredits()
    window.history.replaceState({}, '', window.location.pathname + '?view=studio')
  }
  const [view, setView] = useState<'landing' | 'projects' | 'studio' | 'creative-direction'>(initialView)
  const prevViewRef = useRef<'landing' | 'studio'>('landing')
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [section, setSection] = useState(initialView === 'studio' ? 'dashboard' : 'design')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [techPack, setTechPack] = useState<TechPackData | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin')
  const projectIdRef = useRef<string | undefined>(undefined)

  // Resolve the user id from the live Supabase session, falling back to the
  // context user. Both save paths use this so a project can never be written
  // under a different user_id than the one listProjects() later queries with.
  const resolveUid = async (): Promise<string | null> => {
    const sb = createClient()
    if (sb) {
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user?.id) return session.user.id
    }
    return user?.id ?? null
  }

  // Auto-save to Supabase whenever phase advances
  const autoSave = async (newState: AppState) => {
    const uid = await resolveUid()
    if (!uid) return
    const id = await saveProject(uid, newState, projectIdRef.current)
    if (id) projectIdRef.current = id
  }

  const advancePhase = (updates: Partial<AppState>) => {
    setState(s => {
      const next = { ...s, ...updates }
      autoSave(next)
      return next
    })
  }

  // Persist the current design for the signed-in user and return its project id.
  // Reads the live session so it works immediately after sign-in at checkout,
  // before the `user` state from context has re-rendered.
  const ensureProject = async (): Promise<string | null> => {
    const uid = await resolveUid()
    if (!uid) return null

    const id = await saveProject(uid, state, projectIdRef.current)
    if (id) {
      projectIdRef.current = id
      if (techPack) {
        await saveTechPack(id, {
          style_info: techPack.styleInfo,
          measurements: techPack.measurements,
          pantones: techPack.pantones,
          placements: techPack.placements,
        })
      }
    }
    return id
  }

  const goToPhase = (phase: number) => {
    setSection('design')
    setState(s => ({ ...s, currentPhase: phase }))
    setSidebarOpen(false)
  }

  const handleSectionChange = (s: string) => {
    setSection(s)
    setSidebarOpen(false)
  }

  // Rebuild the in-memory AppState from a saved project row. Newer rows carry a
  // full design_state snapshot (SVG source, logo style, per-view images, and
  // uniform metadata) and restore exactly. Legacy rows saved before that column
  // existed fall back to the dedicated image columns — viewable, but missing the
  // SVG source and uniform metadata that weren't persisted at the time.
  const restoreState = (d: ProjectDetail): AppState => {
    if (d.design_state) return d.design_state
    return {
      currentPhase: d.phase_reached ?? 1,
      logo: d.logo_url ? { svg: '', dataUrl: d.logo_url, style: '', color: '' } : null,
      garment: d.garment_url ? {
        svg: '', dataUrl: d.garment_url, views: {},
        type: d.garment_type ?? '', color: d.garment_color ?? '',
      } : null,
      design: d.composite_url ? { confirmed: true, previewDataUrl: d.composite_url } : null,
      preview: d.preview_urls?.length ? { images: d.preview_urls } : null,
    }
  }

  const openProject = async (id: string) => {
    projectIdRef.current = id
    const detail = await loadProject(id)
    if (detail) {
      setState(restoreState(detail))
      setTechPack(detail.tech_pack ? {
        styleInfo: detail.tech_pack.style_info,
        measurements: detail.tech_pack.measurements,
        pantones: detail.tech_pack.pantones,
        placements: detail.tech_pack.placements,
      } : null)
    } else {
      setState(EMPTY_STATE)
      setTechPack(null)
    }
    setSection('design')
    setView('studio')
  }

  const startNewProject = () => {
    projectIdRef.current = undefined
    setState(EMPTY_STATE)
    setTechPack(null)
    setSection('design')
    setView('studio')
  }

  // Loading spinner while Supabase session resolves
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-grace-ink border-t-transparent rounded-full animate-spin"/>
      </div>
    )
  }

  // Creative Direction form
  if (view === 'creative-direction') {
    return <CreativeDirectionForm onBack={() => setView(prevViewRef.current)} />
  }

  // Landing page
  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onSelfService={() => setView('studio')}
          onCreativeDirection={() => { prevViewRef.current = 'landing'; setView('creative-direction') }}
          onSignIn={() => { setAuthInitialMode('signin'); setAuthOpen(true) }}
          onSignUp={() => { setAuthInitialMode('signup'); setAuthOpen(true) }}
        />
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={() => { setAuthOpen(false); setSection('dashboard'); setView('studio') }}
          initialMode={authInitialMode}
        />
      </>
    )
  }

  // Projects dashboard
  if (view === 'projects') {
    return (
      <ProjectsDashboard
        onNewProject={startNewProject}
        onOpenProject={openProject}
      />
    )
  }

  // Studio
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AIPaywallModal onStartProduction={() => { setSection('design'); setState(s => ({ ...s, currentPhase: 6 })) }} />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)}/>
      )}

      <Sidebar
        section={section}
        onSectionChange={handleSectionChange}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onExpertHelp={() => { prevViewRef.current = 'studio'; setView('creative-direction') }}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-600">
            <Menu size={20}/>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-grace-ink rounded-md flex items-center justify-center text-xs font-bold text-white">G</div>
            <span className="text-sm font-bold text-gray-900">GRACE</span>
          </div>
          <button
            onClick={() => { setSection('settings'); setSidebarOpen(false) }}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-brand-green transition-colors"
            title="Manage AI credits"
          >
            <Sparkles size={12} className="text-brand-green"/>
            <span className={`text-xs font-bold ${generationsLeft > 0 ? 'text-gray-700' : 'text-red-500'}`}>{generationsLeft}</span>
          </button>
          {user && (
            <button onClick={() => setView('projects')} className="text-xs text-gray-400 hover:text-grace-ink transition-colors">
              My Projects
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          {section !== 'design' && (
            <SectionView section={section} state={state} onStartDesign={() => goToPhase(1)} />
          )}
          {section === 'design' && state.currentPhase === 1 && (
            <Phase1Logo
              state={state}
              onComplete={(logo) => advancePhase({ logo, currentPhase: 2 })}
              onSkip={() => advancePhase({ currentPhase: 2 })}
            />
          )}
          {section === 'design' && state.currentPhase === 2 && (
            <Phase2Garment
              state={state}
              onComplete={(garment) => advancePhase({ garment, currentPhase: 3 })}
              onBack={() => goToPhase(1)}
            />
          )}
          {section === 'design' && state.currentPhase === 3 && (
            <Phase3Editor
              state={state}
              onComplete={(design) => advancePhase({ design, currentPhase: 4 })}
              onSetGarment={(garment) => setState(s => ({ ...s, garment }))}
              onBack={() => goToPhase(2)}
            />
          )}
          {section === 'design' && state.currentPhase === 4 && (
            <Phase4Preview
              state={state}
              onComplete={(preview) => advancePhase({ preview, currentPhase: 5 })}
              onBack={() => goToPhase(3)}
            />
          )}
          {section === 'design' && state.currentPhase === 5 && (
            <Phase5TechPack
              state={state}
              onBack={() => goToPhase(4)}
              onSendToProduction={async (tp) => {
                setTechPack(tp)
                advancePhase({ currentPhase: 6 })
                if (user && projectIdRef.current) {
                  await saveTechPack(projectIdRef.current, {
                    style_info: tp.styleInfo,
                    measurements: tp.measurements,
                    pantones: tp.pantones,
                    placements: tp.placements,
                  })
                }
              }}
            />
          )}
          {section === 'design' && state.currentPhase === 6 && techPack && (
            <Phase6Production
              state={state}
              techPack={techPack}
              onBack={() => goToPhase(5)}
              projectId={projectIdRef.current ?? null}
              onEnsureProject={ensureProject}
              onExpertHelp={() => { prevViewRef.current = 'studio'; setView('creative-direction') }}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <AuthProvider>
      <AICreditsProvider>
        <App />
      </AICreditsProvider>
    </AuthProvider>
  )
}
