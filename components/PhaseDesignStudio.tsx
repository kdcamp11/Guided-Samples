'use client'

import { useState, useRef } from 'react'
import { ChevronLeft, Shirt, Sparkles, Upload, ImagePlus } from 'lucide-react'
import { AppState } from '@/app/page'
import Phase3Editor from './Phase3Editor'
import GarmentAssetPanel from './GarmentAssetPanel'
import LogoAssetPanel from './LogoAssetPanel'
import { fileToDataUrl } from '@/lib/fileToDataUrl'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'

interface Props {
  state: AppState
  onComplete: (updates: Partial<AppState>) => void
  onBack: () => void
  onLogoUpdate: (logo: AppState['logo']) => void
  onSetGarment: (garment: AppState['garment']) => void
}

export default function PhaseDesignStudio({ state, onComplete, onBack, onLogoUpdate, onSetGarment }: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  const [localLogo, setLocalLogo] = useState<AppState['logo']>(state.logo)
  const [pendingArtwork, setPendingArtwork] = useState<string | null>(null)
  const artworkInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpdate = (logo: AppState['logo']) => {
    setLocalLogo(logo)
    onLogoUpdate(logo)
  }

  const handleArtworkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      let dataUrl = await fileToDataUrl(file)
      try { dataUrl = await removeWhiteBackground(dataUrl) } catch {}
      setPendingArtwork(dataUrl)
    } catch (err) { console.error('Artwork upload failed', err) }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Asset panel */}
      {panelOpen ? (
        <div className="flex flex-col border-r border-slate-200 bg-white overflow-y-auto shrink-0" style={{ width: 280 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200 shrink-0">
            <span className="text-xs font-semibold text-gray-700">Studio Assets</span>
            <button onClick={() => setPanelOpen(false)} className="p-1 rounded hover:bg-slate-100 text-gray-400 transition-colors" title="Collapse panel">
              <ChevronLeft size={14}/>
            </button>
          </div>

          {/* Garment section */}
          <div className="border-b border-slate-200">
            <div className="px-3 py-2">
              <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">Garment</p>
            </div>
            <GarmentAssetPanel
              route={state.route ?? 'apparel'}
              state={state}
              onSetGarment={onSetGarment}
            />
          </div>

          {/* Logo section */}
          <div className="border-b border-slate-200">
            <div className="px-3 py-2 border-b border-slate-200">
              <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">Logo</p>
            </div>
            <LogoAssetPanel
              state={{ ...state, logo: localLogo }}
              onLogoUpdate={handleLogoUpdate}
            />
          </div>

          {/* Artwork section */}
          <div>
            <div className="px-3 py-2 border-b border-slate-200">
              <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">Artwork</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] text-gray-400 mb-2.5 leading-relaxed">Upload any PNG, SVG, or image to add as a layer on the canvas.</p>
              <label className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-500 hover:text-gray-700">
                <ImagePlus size={13}/>
                Upload Artwork
                <input
                  ref={artworkInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp"
                  onChange={handleArtworkUpload}
                />
              </label>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed strip */
        <div className="flex flex-col items-center gap-2 py-3 border-r border-slate-200 bg-white shrink-0" style={{ width: 48 }}>
          <button onClick={() => setPanelOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-400 transition-colors" title="Expand panel">
            <ChevronLeft size={14} className="rotate-180"/>
          </button>
          <button onClick={() => setPanelOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 transition-colors" title="Garment">
            <Shirt size={16}/>
          </button>
          <button onClick={() => setPanelOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 transition-colors" title="Logo">
            <Sparkles size={16}/>
          </button>
          <button onClick={() => setPanelOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 transition-colors" title="Artwork">
            <Upload size={16}/>
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Phase3Editor
          state={{ ...state, logo: localLogo }}
          hideHeader={true}
          onComplete={(design) => onComplete({ logo: localLogo, design })}
          onSetGarment={onSetGarment}
          onBack={onBack}
          pendingArtwork={pendingArtwork}
          onArtworkConsumed={() => setPendingArtwork(null)}
        />
      </div>
    </div>
  )
}
