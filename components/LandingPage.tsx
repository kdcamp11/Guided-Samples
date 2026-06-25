'use client'

import { ArrowRight, Layers, Eye, FileText, Send, CheckCircle2 } from 'lucide-react'

interface Props {
  onSelfService:        () => void
  onCreativeDirection:  () => void
  onUploadFiles?:       () => void
  onSignIn?:            () => void
  onSignUp?:            () => void
}

function GraceMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="GRACE mark">
      <circle cx="24" cy="24" r="23" stroke="#0A0A0A" strokeWidth="2"/>
      <circle cx="24" cy="24" r="7" fill="#C8372D"/>
    </svg>
  )
}

const PHASES = [
  {
    number: '01',
    label: 'Logo & Brand Mark',
    description: 'Generate your logo with AI or upload your own. White backgrounds are removed automatically for clean placement.',
    tags: ['AI Generation', 'Upload', 'Auto BG Removal'],
  },
  {
    number: '02',
    label: 'Create Your Garment',
    description: 'Describe your blank garment and generate Clean or Realistic renders — or upload your own product photos.',
    tags: ['Text to Garment', 'Clean & Realistic', 'Multi-View'],
  },
  {
    number: '03',
    label: 'Apply Design',
    description: 'Position, scale, and rotate your logo on the garment with a live canvas editor. Confirm to lock in placement.',
    tags: ['Live Editor', 'Drag & Drop', 'Precision Placement'],
  },
  {
    number: '04',
    label: 'Preview in Reality',
    description: 'Generate photorealistic product renders. Describe the scene, lighting, or model to direct the shot exactly how you want.',
    tags: ['Photorealistic', 'Custom Prompt', 'Studio Quality'],
  },
  {
    number: '05',
    label: 'Tech Pack',
    description: 'Full spec sheet with AI-detected measurements, Pantone colors, graphic placement specs, and graded sizing across XS–3XL.',
    tags: ['Auto-Detect', 'Grade Rules', 'Pantones'],
  },
  {
    number: '06',
    label: 'Send to Production',
    description: 'Email the complete production package — logo, garment, tech pack — directly to your supplier, or download as a ZIP.',
    tags: ['Email Supplier', 'ZIP Download', 'One Click'],
  },
]

const FEATURES = [
  'AI-generated garments and logos',
  'Automatic white background removal',
  'Canvas-based design placement editor',
  'Photorealistic product visualization',
  'Auto-detected measurements from garment image',
  'Graded sizing tables (XS–3XL)',
  '10 garment type measurement templates',
  'AI graphic placement detection',
  'Pantone color management',
  'One-click supplier email with attachments',
]

export default function LandingPage({ onSelfService, onCreativeDirection, onUploadFiles, onSignIn, onSignUp }: Props) {
  return (
    <div className="min-h-screen bg-white text-grace-ink overflow-y-auto">

      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-grace-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraceMark size={28}/>
            <span className="font-bold text-grace-ink text-sm tracking-widest uppercase">Grace Enterprise</span>
          </div>
          <div className="flex items-center gap-2">
            {(onSignIn || onSignUp) && (
              <button
                onClick={() => onSignIn?.()}
                className="py-2 px-4 rounded-full bg-grace-ink text-white text-[10px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-8 text-center">
        <p className="phase-header inline-block mb-6">AI-Powered Fashion Design</p>
        <h1 className="text-5xl sm:text-6xl font-black text-grace-ink leading-none tracking-tight mb-6 uppercase">
          Concept to<br/>
          Production
        </h1>
        <p className="text-grace-stone text-base max-w-md mx-auto mb-16 leading-relaxed">
          Choose how you want to work with GRACE.
        </p>

        {/* Path picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-20">

          {/* Creative Direction */}
          <button
            onClick={onCreativeDirection}
            className="group text-left bg-grace-mist hover:bg-zinc-100 transition-all p-7 rounded-2xl flex flex-col gap-4 border border-grace-border"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase">Creative Direction</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-grace-border text-grace-stone tracking-widest uppercase">Full Service</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-2">We Do It For You</h2>
              <p className="text-xs text-grace-stone leading-relaxed">
                Work with GRACE Studios directly. Submit your project brief and our team will handle the design concept, tech pack, and production direction for you.
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-grace-ink mt-auto tracking-widest uppercase">
              Submit Brief <ArrowRight size={12}/>
            </span>
          </button>

          {/* Self Service */}
          <button
            onClick={onSelfService}
            className="group text-left bg-grace-ink hover:bg-zinc-800 transition-all p-7 rounded-2xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Self Service</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Build It Yourself</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                Generate a logo and garment, apply your design, build a full tech pack, and send straight to production — all in 6 guided phases.
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-white mt-auto tracking-widest uppercase">
              Open Studio <ArrowRight size={12}/>
            </span>
          </button>

          {/* Upload Production Files */}
          <button
            onClick={() => onUploadFiles?.()}
            className="group text-left bg-white hover:border-grace-ink transition-all p-7 rounded-2xl flex flex-col gap-4 border border-grace-border"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase">Already Production Ready</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-grace-ink text-white tracking-widest uppercase">AI Preflight</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-2">Upload Production Files</h2>
              <p className="text-xs text-grace-stone leading-relaxed">
                Have finished artwork? Upload it and GRACE’s AI prepress technician inspects, scores, and fixes anything missing — then sends it straight to manufacturing.
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-grace-ink mt-auto tracking-widest uppercase">
              Run Preflight <ArrowRight size={12}/>
            </span>
          </button>

        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-14">
          <p className="phase-header">The Workflow</p>
          <h2 className="text-3xl font-black text-grace-ink uppercase tracking-tight">Six phases. Zero guesswork.</h2>
          <p className="text-grace-stone text-sm mt-3 max-w-md mx-auto">Each phase builds on the last, carrying your assets forward automatically.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PHASES.map((phase, i) => (
            <div key={i} className="card hover:border-grace-ink/20 transition-colors group p-6">
              <div className="flex items-start gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase mb-1">Phase {phase.number}</p>
                  <p className="text-sm font-bold text-grace-ink leading-tight uppercase tracking-tight">{phase.label}</p>
                </div>
              </div>
              <p className="text-xs text-grace-stone leading-relaxed mb-3">{phase.description}</p>
              <div className="flex flex-wrap gap-1">
                {phase.tags.map(tag => (
                  <span key={tag} className="text-[10px] font-semibold bg-grace-mist text-grace-stone px-2 py-0.5 rounded-full tracking-wide">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <div className="flex items-center gap-2 text-xs text-grace-stone flex-wrap justify-center">
            {['Logo', 'Garment', 'Editor', 'Preview', 'Tech Pack', 'Production'].map((label, i, arr) => (
              <span key={label} className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-white border border-grace-border text-grace-ink text-[10px] font-semibold tracking-widest uppercase">{label}</span>
                {i < arr.length - 1 && <ArrowRight size={11} className="text-grace-border shrink-0"/>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-grace-mist border-y border-grace-border py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="phase-header">What&apos;s Included</p>
              <h2 className="text-3xl font-black text-grace-ink uppercase tracking-tight mb-4">Everything to spec and ship</h2>
              <p className="text-grace-stone text-sm leading-relaxed mb-8">
                GRACE Enterprise handles the creative and the technical in a single workflow — so you spend less time back-and-forth and more time building.
              </p>
              <button onClick={onSelfService} className="btn-primary flex items-center gap-2">
                Open Studio <ArrowRight size={12}/>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <CheckCircle2 size={12} className="text-grace-ink mt-0.5 shrink-0"/>
                  <span className="text-xs text-grace-stone">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="bg-grace-ink rounded-3xl px-8 py-20">
          <p className="text-[10px] font-bold tracking-[0.25em] text-white/30 uppercase mb-4">Ready to Build</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight mb-4">Start your first design now</h2>
          <p className="text-white/50 text-sm mb-10 max-w-sm mx-auto">No account required. Upload your logo, describe your garment, and go.</p>
          <button
            onClick={onSelfService}
            className="bg-white text-grace-ink font-bold px-10 py-3 rounded-full hover:bg-grace-mist transition-colors text-xs tracking-widest uppercase"
          >
            Launch Studio
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-grace-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-grace-stone">
          <div className="flex items-center gap-3">
            <GraceMark size={22}/>
            <span className="font-bold tracking-widest uppercase text-grace-ink text-[10px]">Grace Enterprise</span>
          </div>
          <span className="tracking-wide">AI-Powered Fashion Design Platform</span>
        </div>
      </footer>

    </div>
  )
}
