'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: string | number
}

export default function AccordionSection({ title, defaultOpen = false, children, badge }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold text-gray-800 uppercase tracking-wider flex items-center gap-2">
          {title}
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full bg-grace-ink text-white text-[9px] font-bold">{badge}</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}
