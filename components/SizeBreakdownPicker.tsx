'use client'

import { Minus, Plus } from 'lucide-react'
import { SIZES, sumBreakdown, type SizeBreakdown } from '@/lib/sizes'

interface Props {
  value:    SizeBreakdown
  onChange: (next: SizeBreakdown) => void
  /** Minimum total across all sizes (MOQ). 0 = no minimum. */
  minTotal?: number
  disabled?: boolean
}

/**
 * A compact grid of per-size steppers with a running total. Used for both
 * sample (no MOQ) and bulk (MOQ) quantity selection.
 */
export default function SizeBreakdownPicker({ value, onChange, minTotal = 0, disabled }: Props) {
  const total = sumBreakdown(value)
  const belowMin = minTotal > 0 && total < minTotal

  function set(size: string, qty: number) {
    onChange({ ...value, [size]: Math.max(0, Math.floor(qty) || 0) })
  }
  function adjust(size: string, delta: number) {
    set(size, (value[size] ?? 0) + delta)
  }

  return (
    <div>
      <div className="space-y-1.5">
        {SIZES.map(size => (
          <div key={size} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 w-7 shrink-0">{size}</span>
            <div className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => adjust(size, -1)}
                disabled={disabled || (value[size] ?? 0) <= 0}
                className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-gray-600 hover:bg-slate-50 disabled:opacity-30 shrink-0"
                aria-label={`Decrease ${size}`}
              >
                <Minus size={12} />
              </button>
              <input
                type="number"
                min={0}
                value={value[size] ?? 0}
                disabled={disabled}
                onChange={e => set(size, Number(e.target.value))}
                className="w-10 text-center text-xs font-semibold text-gray-900 border border-slate-200 rounded-md py-0.5 focus:outline-none focus:border-brand-green disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => adjust(size, 1)}
                disabled={disabled}
                className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-gray-600 hover:bg-slate-50 disabled:opacity-30 shrink-0"
                aria-label={`Increase ${size}`}
              >
                <Plus size={12} />
              </button>
              {(value[size] ?? 0) > 0 && (
                <span className="text-[10px] text-gray-400 ml-1">{value[size]} pc{(value[size] ?? 0) > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[11px] ${belowMin ? 'text-red-500' : 'text-gray-500'}`}>
          {minTotal > 0
            ? belowMin
              ? `Minimum ${minTotal} pieces — add ${minTotal - total} more`
              : `Total ${total} pieces (min ${minTotal})`
            : `Total ${total} piece${total === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  )
}
