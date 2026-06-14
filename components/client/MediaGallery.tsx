'use client'

import { FileImage, ExternalLink } from 'lucide-react'
import { STAGE_LABELS, type ProductionStage } from '@/types/productionStages'
import type { OrderMedia } from '@/types/supplier'

interface Props {
  media: OrderMedia[]
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  first_piece_review: 'First Piece Photos',
  revised_sample:     'Revised Sample Photos',
  qc_report:          'Quality Check Report',
  packing_photo:      'Packing Photos',
  other:              'Other',
}

export default function MediaGallery({ media }: Props) {
  if (media.length === 0) return null

  const byStage = media.reduce<Record<string, OrderMedia[]>>((acc, m) => {
    acc[m.stage] = [...(acc[m.stage] ?? []), m]
    return acc
  }, {})

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <FileImage size={14} className="text-brand-green" />
        <p className="text-xs font-semibold text-gray-900">Production Media</p>
      </div>
      {Object.entries(byStage).map(([stage, items]) => (
        <div key={stage} className="mb-4 last:mb-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
            {STAGE_LABELS[stage as ProductionStage] ?? stage}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {items.map(m => (
              <a
                key={m.id}
                href={m.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block bg-slate-50 rounded-lg overflow-hidden hover:ring-2 hover:ring-brand-green/30 transition-all"
                title={m.file_name}
              >
                {m.mime_type?.startsWith('image/') ? (
                  <div className="relative">
                    <img
                      src={m.public_url}
                      alt={m.file_name}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <ExternalLink size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-square flex flex-col items-center justify-center gap-1 p-2">
                    <FileImage size={20} className="text-gray-300" />
                    <span className="text-[9px] text-gray-400 text-center truncate w-full px-1">
                      {MEDIA_TYPE_LABELS[m.media_type] ?? m.file_name}
                    </span>
                    <ExternalLink size={10} className="text-gray-300 group-hover:text-brand-green transition-colors" />
                  </div>
                )}
              </a>
            ))}
          </div>
          {items.some(m => m.notes) && (
            <p className="mt-2 text-[11px] text-gray-500 italic">
              {items.find(m => m.notes)?.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
