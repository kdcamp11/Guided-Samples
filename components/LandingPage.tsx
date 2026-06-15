'use client'

import { ArrowRight, Sparkles, Layers, Eye, FileText, Send, CheckCircle2, Wand2 } from 'lucide-react'

interface Props {
  onSelfService:        () => void
  onCreativeDirection:  () => void
  onSignIn?:            () => void
}

const PHASES = [
  {
    number: '01',
    icon: Sparkles,
    label: 'Logo & Brand Mark',
    description: 'Generate your logo with AI or upload your own. White backgrounds are removed automatically for clean placement.',
    tags: ['AI Generation', 'Upload', 'Auto BG Removal'],
  },
  {
    number: '02',
    icon: Layers,
    label: 'Create Your Garment',
    description: 'Describe your blank garment and generate Clean or Realistic renders — or upload your own product photos.',
    tags: ['Text to Garment', 'Clean & Realistic', 'Multi-View'],
  },
  {
    number: '03',
    icon: Layers,
    label: 'Apply Design',
    description: 'Position, scale, and rotate your logo on the garment with a live canvas editor. Confirm to lock in placement.',
    tags: ['Live Editor', 'Drag & Drop', 'Precision Placement'],
  },
  {
    number: '04',
    icon: Eye,
    label: 'Preview in Reality',
    description: 'Generate photorealistic product renders. Describe the scene, lighting, or model to direct the shot exactly how you want.',
    tags: ['Photorealistic', 'Custom Prompt', 'Studio Quality'],
  },
  {
    number: '05',
    icon: FileText,
    label: 'Tech Pack',
    description: 'Full spec sheet with AI-detected measurements, Pantone colors, graphic placement specs, and graded sizing across XS–3XL.',
    tags: ['Auto-Detect', 'Grade Rules', 'Pantones'],
  },
  {
    number: '06',
    icon: Send,
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

export default function LandingPage({ onSelfService, onCreativeDirection, onSignIn }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-y-auto">

      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-green flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm tracking-tight">GRACE Enterprise</span>
          </div>
          <div className="flex items-center gap-2">
            {onSignIn && (
              <button onClick={onSignIn} className="btn-secondary py-2 text-xs">
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-6 text-center">
        <p className="phase-header inline-block mb-4">AI-Powered Fashion Design</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-5">
          From concept to<br/>
          <span className="text-brand-green">production-ready</span>
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto mb-12 leading-relaxed">
          Choose how you want to work with GRACE.
        </p>

        {/* Path picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-16">

          {/* Self Service */}
          <button
            onClick={onSelfService}
            className="group text-left card border-2 border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/5 transition-all p-6 flex flex-col gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-green/10 flex items-center justify-center transition-colors">
              <Sparkles size={18} className="text-gray-500 group-hover:text-brand-green transition-colors"/>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-900">Self Service</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green">Recommended</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Build your own design end-to-end. Generate a logo and garment, apply your design, build a full tech pack, and send straight to production — all in 6 guided phases.
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold text-brand-green mt-auto">
              Open Studio <ArrowRight size={12}/>
            </span>
          </button>

          {/* Creative Direction */}
          <button
            onClick={onCreativeDirection}
            className="group text-left card border-2 border-slate-200 hover:border-gray-400/40 hover:bg-gray-50 transition-all p-6 flex flex-col gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-gray-200/60 flex items-center justify-center transition-colors">
              <Wand2 size={18} className="text-gray-500"/>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-900">Creative Direction</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Full Service</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Work with GRACE Studios directly. Submit your project brief and our team will handle the design concept, tech pack, and production direction for you.
              </p>
            </div>
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-600 mt-auto">
              Submit Brief <ArrowRight size={12}/>
            </span>
          </button>

        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="text-center mb-12">
          <p className="phase-header">The Workflow</p>
          <h2 className="text-2xl font-bold text-gray-900">Six phases, zero guesswork</h2>
          <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">Each phase builds on the last, carrying your assets forward automatically.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon
            return (
              <div key={i} className="card hover:border-brand-green/30 transition-colors group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0 group-hover:bg-brand-green/20 transition-colors">
                    <Icon size={16} className="text-brand-green"/>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-brand-green uppercase">Phase {phase.number}</p>
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{phase.label}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">{phase.description}</p>
                <div className="flex flex-wrap gap-1">
                  {phase.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-medium bg-slate-100 text-gray-500 px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Arrow connector */}
        <div className="flex justify-center mt-8">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {['Logo', 'Garment', 'Editor', 'Preview', 'Tech Pack', 'Production'].map((label, i, arr) => (
              <span key={label} className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-gray-600 text-[11px] font-medium">{label}</span>
                {i < arr.length - 1 && <ArrowRight size={12} className="text-brand-green shrink-0"/>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="phase-header">What's Included</p>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Everything you need to spec and ship</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                GRACE Enterprise handles the creative and the technical in a single workflow — so you spend less time back-and-forth and more time building.
              </p>
              <button onClick={onSelfService} className="btn-primary flex items-center gap-2">
                Open Studio <ArrowRight size={14}/>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-brand-green mt-0.5 shrink-0"/>
                  <span className="text-xs text-gray-600">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="bg-brand-green rounded-2xl px-8 py-14">
          <p className="text-brand-green/40 text-xs font-bold tracking-widest uppercase mb-3">Ready to build</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Start your first design now</h2>
          <p className="text-white/60 text-sm mb-8 max-w-sm mx-auto">No account required. Upload your logo, describe your garment, and go.</p>
          <button
            onClick={onSelfService}
            className="bg-white text-brand-green font-semibold px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 mx-auto text-sm"
          >
            <Sparkles size={15}/> Launch Studio
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-brand-green flex items-center justify-center">
              <span className="text-white text-[9px] font-bold">G</span>
            </div>
            <span>GRACE Enterprise</span>
          </div>
          <span>AI-Powered Fashion Design Platform</span>
        </div>
      </footer>

    </div>
  )
}
