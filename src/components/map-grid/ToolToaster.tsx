// ─── Map Grid — floating tool bar ─────────────────────────────────────────────
// A small panel pinned to the top right of the map view that holds everything about the tool in use, with an X in its corner that ends
// the tool. Tools whose actions used to be a row of bare icons in the toolbar (Select first) put them here, labelled.
// It sits inside the map view's positioned container; the pointer handlers keep clicks on it from reaching the grid underneath.

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Cancel } from '@/components/ui/icons'

interface Props {
  title: ReactNode
  onClose: () => void
  closeTitle?: string
  children: ReactNode
}

export default function ToolToaster({ title, onClose, closeTitle, children }: Props) {
  return (
    <div
      className="absolute right-2 top-2 z-[1000] w-64 rounded-lg bg-popover/95 p-2 text-xs shadow-lg ring-1 ring-border"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      data-nodrag
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={closeTitle} onClick={onClose}>
          <Cancel className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
