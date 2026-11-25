// ─── Map Grid — floating tool bar ─────────────────────────────────────────────
// A small panel in the map view that holds everything about the tool in use, with an X in its corner that ends the tool. It starts at the top
// right and can be dragged by its title; it stays where it was put (also for the next tool and the next session), and a double click on the
// title puts it back. Tools whose actions used to be a row of bare icons in the toolbar (Select first) put them here, labelled.
// It sits inside the map view's positioned container; the pointer handlers keep clicks on it from reaching the grid underneath.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Cancel } from '@/components/ui/icons'

interface Props {
  title: ReactNode
  onClose: () => void
  closeTitle?: string
  children: ReactNode
}

const STORAGE_KEY = 'oe-tool-toaster-offset'

interface Offset {
  dx: number
  dy: number
}

/** The offset from the top-right start position, kept for the whole session so each tool's toaster opens where the last one was left. */
let savedOffset: Offset = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Offset> | null
    if (raw && Number.isFinite(raw.dx) && Number.isFinite(raw.dy)) return { dx: raw.dx as number, dy: raw.dy as number }
  } catch { /* not remembered */ }
  return { dx: 0, dy: 0 }
})()

function remember(offset: Offset): void {
  savedOffset = offset
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(offset)) } catch { /* not remembered */ }
}

export default function ToolToaster({ title, onClose, closeTitle, children }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState<Offset>(savedOffset)
  const drag = useRef<{ x: number; y: number; from: Offset } | null>(null)

  // Keeps the whole panel inside the map view: at its start (a smaller window than when it was left) and while dragging.
  const clamp = useCallback((o: Offset): Offset => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return o
    // The panel's start is top 8, right 8 (top-2 right-2): it may go as far left as the parent is wide, and as far down as it is tall.
    const minDx = -(parent.clientWidth - el.offsetWidth - 16)
    const maxDy = parent.clientHeight - el.offsetHeight - 16
    return { dx: Math.min(0, Math.max(minDx, o.dx)), dy: Math.max(0, Math.min(maxDy, o.dy)) }
  }, [])

  useLayoutEffect(() => { setOffset((o) => clamp(o)) }, [clamp])
  useEffect(() => {
    const onResize = () => setOffset((o) => clamp(o))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, from: offset }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setOffset(clamp({ dx: d.from.dx + e.clientX - d.x, dy: d.from.dy + e.clientY - d.y }))
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    remember(offset)
  }
  const reset = () => {
    setOffset({ dx: 0, dy: 0 })
    remember({ dx: 0, dy: 0 })
  }

  return (
    <div
      ref={ref}
      className="absolute right-2 top-2 z-[1000] w-64 rounded-lg bg-popover/95 p-2 text-xs shadow-lg ring-1 ring-border"
      style={{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      data-nodrag
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {/* The title is the handle: the X and the panel's own buttons keep their clicks. */}
        <div
          className="flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={reset}
          title={t('mapGrid.mapGridDialog.toasterMoveTitle')}
        >
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={closeTitle} onClick={onClose}>
          <Cancel className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
