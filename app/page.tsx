'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { saveProject, saveTechPack, loadProject } from '@/lib/projects'
import type { ProjectDetail } from '@/lib/projects'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SignIn from '@/components/SignIn'
import AuthModal from '@/components/AuthModal'
import ProjectsDashboard from '@/components/ProjectsDashboard'
import Phase2Garment from '@/components/Phase2Garment'
import Phase3Editor, { clearDesignCache } from '@/components/Phase3Editor'
import Phase4Preview from '@/components/Phase4Preview'
import Phase5TechPack from '@/components/Phase5TechPack'
import Phase6Production from '@/components/Phase6Production'
import PhaseDesignStudio from '@/components/PhaseDesignStudio'
import type { TechPackData } from '@/components/Phase6Production'
import SectionView from '@/components/SectionView'
import LandingPage from '@/components/LandingPage'
import UploadProduction from '@/components/UploadProduction'
import CreativeDirectionForm from '@/components/CreativeDirectionForm'
import AIPaywallModal from '@/components/AIPaywallModal'
import { AICreditsProvider, useAICredits } from '@/lib/aiCreditsContext'
import { Menu, Loader2, Check, AlertCircle } from 'lucide-react'

export type StudioLayersByView = Record<string, unknown[]>

export type AppState = {
  currentPhase: number
  route?: 'apparel' | 'uniform'
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
    assets?: {
      full?: string
      garment?: string
      logo?: string
      artworks?: string[]
    }
  } | null
  preview: {
    images: string[]
    techImages?: string[]
  } | null
  studioState?: {
    layersByView: StudioLayersByView
    garmentColor: string
    logoGallery?: string[]
    artworkGallery?: string[]
    thumbnailDataUrl?: string
  }
}

const EMPTY_STATE: AppState = {
  currentPhase: 1,
  route: undefined,
  logo: null,
  garment: null,
  design: null,
  preview: null,
}

function App() {
  const { user, loading } = useAuth()
  const { refreshCredits } = useAICredits()

  // Redirect to landing whenever the user signs out (transitions from logged-in → null).
  useEffect(() => {
    if (!loading && prevUserRef.current && !user) {
      setView('landing')
      setSection('dashboard')
    }
    prevUserRef.current = user
  }, [user, loading])
  // Allow deep-linking straight to the studio dashboard (e.g. the "home" link
  // from the /track orders page) via /?view=studio.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const initialView = params?.get('view') === 'studio' ? 'studio' as const : 'landing' as const
  // Refresh credits when returning from a Stripe credit-purchase session
  if (params?.get('credits_added') && typeof window !== 'undefined') {
    refreshCredits()
    window.history.replaceState({}, '', window.location.pathname + '?view=studio')
  }
  const [view, setView] = useState<'landing' | 'studio' | 'creative-direction' | 'upload-production'>(initialView)
  // Track previous user to detect sign-out
  const prevUserRef = useRef<{ id: string } | null>(null)
  const prevViewRef = useRef<'landing' | 'studio'>('landing')
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [section, setSection] = useState(initialView === 'studio' ? 'dashboard' : 'design')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [techPack, setTechPack] = useState<TechPackData | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin')
  const projectIdRef = useRef<string | undefined>(undefined)
  const isExistingProjectRef = useRef(false)
  const [saveToast, setSaveToast] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolve the user id from the live Supabase session, falling back to the
  // context user. Both save paths use this so a project can never be written
  // under a different user_id than the one listProjects() later queries with.
  const resolveUid = useCallback(async (): Promise<string | null> => {
    const sb = createClient()
    if (sb) {
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user?.id) return session.user.id
    }
    return user?.id ?? null
  }, [user?.id])

  // Auto-save to Supabase on every phase transition.
  // Never persist while still on Phase 1 (the route/garment picker) — opening a
  // project or starting one and not moving past the picker should not write a
  // row or generate a thumbnail.
  const autoSave = useCallback(async (newState: AppState) => {
    if (newState.currentPhase < 2) return
    setSaveToast('saving')
    if (toastTimer.current) clearTimeout(toastTimer.current)
    const uid = await resolveUid()
    if (!uid) { setSaveToast('idle'); return }
    const id = await saveProject(uid, newState, projectIdRef.current)
    if (id) {
      projectIdRef.current = id
      setSaveToast('saved')
    } else {
      setSaveToast('error')
    }
    toastTimer.current = setTimeout(() => setSaveToast('idle'), 2500)
  }, [resolveUid])

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
    setState(s => {
      const next = { ...s, currentPhase: phase }
      autoSave(next)
      return next
    })
    setSidebarOpen(false)
  }

  const handleSectionChange = (s: string) => {
    setSection(s)
    setSidebarOpen(false)
  }

  // Show the Projects dashboard inside the studio shell so the sidebar persists.
  const goToProjects = () => {
    setView('studio')
    setSection('projects')
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
    isExistingProjectRef.current = true
    clearDesignCache()
    const detail = await loadProject(id)
    if (detail) {
      const restored = restoreState(detail)
      // Never drop back to the route-picker (Phase 1) when reopening an existing
      // project — the garment/sport choice is a new-project-only step.
      if (restored.currentPhase < 2) restored.currentPhase = 2
      setState(restored)
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
    isExistingProjectRef.current = false
    clearDesignCache()
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

  // Upload Production Files — AI prepress / production-readiness assistant
  if (view === 'upload-production') {
    return (
      <UploadProduction
        onBack={() => setView('landing')}
        onContinue={() => { setSection('dashboard'); setView('studio') }}
      />
    )
  }

  // Landing page
  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onSelfService={() => setView('studio')}
          onCreativeDirection={() => { prevViewRef.current = 'landing'; setView('creative-direction') }}
          onUploadFiles={() => setView('upload-production')}
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

  // Studio
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AIPaywallModal onStartProduction={() => { setSection('design'); setState(s => ({ ...s, currentPhase: 5 })) }} />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)}/>
      )}

      <Sidebar
        section={section}
        onSectionChange={handleSectionChange}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onExpertHelp={() => { prevViewRef.current = 'studio'; setView('creative-direction') }}
        currentPhase={state.currentPhase}
        onPhaseChange={goToPhase}
        state={state}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Global save toast — shown on desktop above main content */}
        {saveToast !== 'idle' && (
          <div className={`hidden lg:flex fixed top-3 right-4 z-50 items-center gap-2 px-3 py-2 rounded-lg shadow-md text-xs font-medium transition-all ${
            saveToast === 'saving' ? 'bg-white border border-slate-200 text-gray-500' :
            saveToast === 'saved'  ? 'bg-white border border-brand-green/30 text-brand-green' :
            'bg-white border border-red-200 text-red-500'
          }`}>
            {saveToast === 'saving' && <Loader2 size={12} className="animate-spin"/>}
            {saveToast === 'saved'  && <Check size={12}/>}
            {saveToast === 'error'  && <AlertCircle size={12}/>}
            {saveToast === 'saving' ? 'Saving…' : saveToast === 'saved' ? 'Project saved' : 'Save failed'}
          </div>
        )}
        {/* Shared top banner — same on every page: GRACE Enterprise far left */}
        <header className="flex items-center px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 mr-2 rounded-lg hover:bg-slate-100 text-gray-600">
            <Menu size={20}/>
          </button>
          <span className="text-sm font-semibold text-gray-900">GRACE Enterprise</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {section === 'projects' && (
            <ProjectsDashboard onNewProject={startNewProject} onOpenProject={openProject} />
          )}
          {section !== 'design' && section !== 'projects' && (
            <SectionView section={section} state={state} onStartDesign={() => goToPhase(1)} />
          )}
          {section === 'design' && state.currentPhase === 1 && (
            <Phase2Garment
              state={state}
              onComplete={(route) => advancePhase({ route, currentPhase: 2 })}
              onBack={goToProjects}
            />
          )}
          {section === 'design' && state.currentPhase === 2 && (
            <PhaseDesignStudio
              state={state}
              onComplete={(updates) => advancePhase({ ...updates, currentPhase: 3 })}
              onBack={() => isExistingProjectRef.current ? goToProjects() : goToPhase(1)}
              onLogoUpdate={(logo) => setState(s => ({ ...s, logo }))}
              onSetGarment={(garment) => setState(s => ({ ...s, garment }))}
              onStudioStateChange={(studioState) => setState(s => {
                  const next = { ...s, studioState }
                  autoSave(next)
                  return next
                })}
            />
          )}
          {section === 'design' && state.currentPhase === 3 && (
            <Phase4Preview
              state={state}
              onSavePreview={(preview) => setState(s => { const next = { ...s, preview }; autoSave(next); return next })}
              onComplete={(preview) => advancePhase({ preview, currentPhase: 4 })}
              onBack={() => goToPhase(2)}
            />
          )}
          {section === 'design' && state.currentPhase === 4 && (
            <Phase5TechPack
              state={state}
              onBack={() => goToPhase(3)}
              onSendToProduction={async (tp) => {
                setTechPack(tp)
                advancePhase({ currentPhase: 5 })
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
          {section === 'design' && state.currentPhase === 5 && techPack && (
            <Phase6Production
              state={state}
              techPack={techPack}
              onBack={() => goToPhase(4)}
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
