'use client'

import { Info } from 'lucide-react'

// Small inline hint shown next to any AI action, making it clear that running it
// consumes one of the user's AI generations. Hover (or focus) reveals the note.
export default function AIUsageHint({
  className = '',
  label = 'Heads up: this uses one of your AI generations.',
}: {
  className?: string
  label?: string
}) {
  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      <Info
        size={12}
        tabIndex={0}
        aria-label={label}
        className="text-gray-400 hover:text-grace-ink focus:text-grace-ink cursor-help outline-none"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-grace-ink px-2.5 py-1.5 text-[10px] leading-snug text-white text-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-20 shadow-lg"
      >
        {label}
      </span>
    </span>
  )
}
