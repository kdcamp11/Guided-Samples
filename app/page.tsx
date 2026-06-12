'use client'

import { useState } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import SignIn from '@/components/SignIn'
import Phase1Logo from '@/components/Phase1Logo'
import Phase2Garment from '@/components/Phase2Garment'
import Phase3Editor from '@/components/Phase3Editor'
import Phase4Preview from '@/components/Phase4Preview'
import Phase5TechPack from '@/components/Phase5TechPack'
import SectionView from '@/components/SectionView'
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

function App() {
  const { user, loading } = useAuth()
  const [state, setState] = useState<AppState>({
    currentPhase: 1,
    logo: null,
    garment: null,
    design: null,
    preview: null,
  })
  const [section, setSection] = useState('design')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin"/>
      </div>
    )
  }

  if (!user) return <SignIn />

  const goToPhase = (phase: number) => {
    setSection('design')
    setState(s => ({ ...s, currentPhase: phase }))
    setSidebarOpen(false)
  }

  const handleSectionChange = (s: string) => {
    setSection(s)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
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
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-gray-600"
          >
            <Menu size={20}/>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-green rounded-md flex items-center justify-center text-xs font-bold text-white">G</div>
            <span className="text-sm font-bold text-gray-900">GRACE</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {section !== 'design' && (
            <SectionView section={section} state={state} onStartDesign={() => goToPhase(1)} />
          )}
          {section === 'design' && state.currentPhase === 1 && (
            <Phase1Logo
              state={state}
              onComplete={(logo) => setState(s => ({ ...s, logo, currentPhase: 2 }))}
              onSkip={() => setState(s => ({ ...s, currentPhase: 2 }))}
            />
          )}
          {section === 'design' && state.currentPhase === 2 && (
            <Phase2Garment
              state={state}
              onComplete={(garment) => setState(s => ({ ...s, garment, currentPhase: 3 }))}
              onBack={() => goToPhase(1)}
            />
          )}
          {section === 'design' && state.currentPhase === 3 && (
            <Phase3Editor
              state={state}
              onComplete={(design) => setState(s => ({ ...s, design, currentPhase: 4 }))}
              onSetGarment={(garment) => setState(s => ({ ...s, garment }))}
              onBack={() => goToPhase(2)}
            />
          )}
          {section === 'design' && state.currentPhase === 4 && (
            <Phase4Preview
              state={state}
              onComplete={(preview) => setState(s => ({ ...s, preview, currentPhase: 5 }))}
              onBack={() => goToPhase(3)}
            />
          )}
          {section === 'design' && state.currentPhase === 5 && (
            <Phase5TechPack
              state={state}
              onBack={() => goToPhase(4)}
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
