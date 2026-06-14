'use client'

import { useState, useRef } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import { saveProject, saveTechPack } from '@/lib/projects'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SignIn from '@/components/SignIn'
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
import { Menu } from 'lucide-react'

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
  const [view, setView] = useState<'landing' | 'projects' | 'studio'>('landing')
  const [state, setState] = useState<AppState>(EMPTY_STATE)
  const [section, setSection] = useState('design')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [techPack, setTechPack] = useState<TechPackData | null>(null)
  const projectIdRef = useRef<string | undefined>(undefined)

  // Auto-save to Supabase whenever phase advances
  const autoSave = async (newState: AppState) => {
    if (!user) return
    const id = await saveProject(user.id, newState, projectIdRef.current)
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
    const sb = createClient()
    if (!sb) return null
    const { data: { session } } = await sb.auth.getSession()
    const uid = session?.user?.id
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
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin"/>
      </div>
    )
  }

  // Landing page
  if (view === 'landing') {
    return (
      <LandingPage
        onEnter={() => setView('studio')}
        onSignIn={() => setView('studio')}
      />
    )
  }

  // Projects dashboard
  if (view === 'projects') {
    return (
      <ProjectsDashboard
        onNewProject={startNewProject}
        onOpenProject={(_id) => {
          // TODO: restore project state from Supabase
          projectIdRef.current = _id
          setState(EMPTY_STATE)
          setView('studio')
        }}
      />
    )
  }

  // Studio
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)}/>
      )}

      <Sidebar
        currentPhase={state.currentPhase}
        onPhaseChange={goToPhase}
        state={state}
        section={section}
        onSectionChange={handleSectionChange}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-600">
            <Menu size={20}/>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-green rounded-md flex items-center justify-center text-xs font-bold text-white">G</div>
            <span className="text-sm font-bold text-gray-900">GRACE</span>
          </div>
          {user && (
            <button onClick={() => setView('projects')} className="ml-auto text-xs text-gray-400 hover:text-brand-green transition-colors">
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
      <App />
    </AuthProvider>
  )
}
