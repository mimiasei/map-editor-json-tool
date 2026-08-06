// ─── Map Grid dialog — full-map 2D grid viewer (issue #122, Phase 1) ────────
// View-only MVP: every map tile as a cell, category filters, pan/zoom, hover
// info, click-to-pin. No editing yet — see the plan doc for Phase 2.
//
// Rendering is two-layer, not two-"mode": a canvas swatch layer (cheap
// regardless of map size — real maps go up to 256×256 = 65,536 tiles, too
// many to mount as DOM nodes unconditionally) always sits underneath, and a
// windowed DOM layer (real icons/letters, hover, click) draws on top only for
// whatever's currently in the viewport, so the mounted-node count stays
// bounded by viewport size, not total map size. Both layers share one
// pan/zoom transform and the same pixel-per-cell coordinate space, so they
// never drift out of alignment.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import {
  buildTileIndex,
  pickPrimary,
  getVisibleRange,
  GRID_GROUP_ORDER,
  GRID_GROUP_LABELS,
  type GridGroup,
} from '@/lib/map-grid/tile-index'
import type { PlacedObject } from '@/types/map-context'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

// ─── Layout constants ────────────────────────────────────────────────────────

const BASE_CELL_PX = 32
const MIN_SCALE = 0.05
const MAX_SCALE = 4
/** Below this on-screen cell size, icons/letters aren't legible — canvas swatches only. */
const ICON_LOD_THRESHOLD_PX = 16
const OVERDRAW_CELLS = 3

// One flat color per group, for the canvas swatch layer.
const GROUP_COLORS: Record<GridGroup, string> = {
  units: '#e0554f',
  artifacts: '#c9a227',
  spawners: '#4f7fe0',
  interactables: '#5fae5a',
  resources: '#c97fe0',
  decorations: '#8a8a8a',
}

// ─── Filter state (persisted) ────────────────────────────────────────────────

type GridFilterState = Record<GridGroup, boolean>

const GRID_FILTER_STORAGE_KEY = 'oe-map-grid-filter'

function loadGridFilter(): GridFilterState {
  const fallback = Object.fromEntries(GRID_GROUP_ORDER.map((g) => [g, true])) as GridFilterState
  try {
    const raw = localStorage.getItem(GRID_FILTER_STORAGE_KEY)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return fallback
}

function saveGridFilter(f: GridFilterState): void {
  try { localStorage.setItem(GRID_FILTER_STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// ─── Transform ────────────────────────────────────────────────────────────────

interface Transform { x: number; y: number; scale: number }

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function MapGridDialog({ open, onOpenChange }: Props) {
  const context = useMapContextStore((s) => s.context)
  const catalog = useCatalogStore((s) => s.catalog)

  const sizeX = context?.sizeX ?? 0
  const sizeZ = context?.sizeZ ?? 0
  const placedObjects = context?.placedObjects ?? []

  const [filter, setFilter] = useState<GridFilterState>(loadGridFilter)
  const toggleGroup = (g: GridGroup) => {
    setFilter((prev) => {
      const next = { ...prev, [g]: !prev[g] }
      saveGridFilter(next)
      return next
    })
  }

  // ── Tile index + per-tile primary pick (only for OCCUPIED tiles — a few
  // thousand at most, never the full sizeX*sizeZ space) ──────────────────────
  const tileIndex = useMemo(() => buildTileIndex(placedObjects), [placedObjects])

  const primaryByNode = useMemo(() => {
    const map = new Map<number, { primary: PlacedObject; group: GridGroup; count: number }>()
    for (const [node, items] of tileIndex) {
      const filtered = items.filter((item) => {
        if (item.type === 1) return false // markers never shown
        return true
      })
      const pick = pickPrimary(filtered, catalog)
      if (!pick || !filter[pick.group]) continue
      map.set(node, pick)
    }
    return map
  }, [tileIndex, catalog, filter])

  // ── Pan/zoom transform ──────────────────────────────────────────────────────
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  // State-backed (not a plain ref): DraggableDialogContent defers its own
  // layout via internal state that resolves through its own effect, so a
  // plain useEffect here can fire before that resolves and never re-fire once
  // it does (nothing in ITS OWN deps would change). A callback ref, by
  // contrast, is invoked by React exactly when this DOM node mounts, no
  // matter how deeply that mount was deferred by an ancestor.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number; moved: boolean } | null>(null)

  const fitToViewport = useCallback(() => {
    if (!viewportEl || sizeX <= 0 || sizeZ <= 0) return
    const { width, height } = viewportEl.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const totalW = sizeX * BASE_CELL_PX
    const totalH = sizeZ * BASE_CELL_PX
    const scale = clampScale(Math.min(width / totalW, height / totalH, 1))
    setTransform({
      x: (width - totalW * scale) / 2,
      y: (height - totalH * scale) / 2,
      scale,
    })
    setContainerSize({ width, height })
  }, [viewportEl, sizeX, sizeZ])

  // Auto-fit on the FIRST real (non-zero) layout measurement after opening.
  const hasAutoFitRef = useRef(false)
  useEffect(() => {
    if (!open || !viewportEl) { hasAutoFitRef.current = false; return }
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
      if (!hasAutoFitRef.current && width > 0 && height > 0) {
        hasAutoFitRef.current = true
        fitToViewport()
      }
    })
    ro.observe(viewportEl)
    return () => ro.disconnect()
  }, [open, viewportEl, fitToViewport])

  // Panning must work when the drag starts on top of an icon cell (icons can
  // cover most of the visible area once zoomed in), so pointer capture can't
  // simply be skipped based on the pointerdown target. It also can't be
  // acquired unconditionally on pointerdown and released again on a
  // non-moved pointerup: empirically (verified with a real browser), once
  // capture has been active for any part of a pointerdown→pointerup
  // sequence, the browser's derived click event still targets the capturing
  // element even after capture is released before the click is dispatched —
  // releasing "in time" does not un-redirect it.
  //
  // The fix instead is to never acquire capture in the first place until
  // real movement is confirmed: acquire it lazily inside onPointerMove, the
  // instant the pointer crosses a small threshold. A plain click (no
  // movement) then never triggers capture at all, so it reaches whatever's
  // actually under the cursor — the cell — with no redirection to fight.
  const CLICK_DRAG_THRESHOLD_PX = 4
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y, moved: false }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX) return
      drag.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    setTransform((prev) => ({ ...prev, x: drag.startTx + dx, y: drag.startTy + dy }))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  const zoomAt = useCallback((cursorX: number, cursorY: number, factor: number) => {
    setTransform((prev) => {
      const newScale = clampScale(prev.scale * factor)
      const worldX = (cursorX - prev.x) / prev.scale
      const worldY = (cursorY - prev.y) / prev.scale
      return { scale: newScale, x: cursorX - worldX * newScale, y: cursorY - worldY * newScale }
    })
  }, [])

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const factor = Math.exp(-e.deltaY * 0.001)
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)
  }

  // ── Canvas overview layer — redrawn whenever the occupied set / filter /
  // catalog changes, or whenever the canvas element itself (re)mounts. Same
  // callback-ref reasoning as viewportEl above.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!canvasEl || sizeX <= 0 || sizeZ <= 0) return
    const canvas = canvasEl
    canvas.width = sizeX
    canvas.height = sizeZ
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, sizeX, sizeZ)
    for (const [node, pick] of primaryByNode) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillStyle = GROUP_COLORS[pick.group]
      ctx.fillRect(x, z, 1, 1)
    }
  }, [canvasEl, primaryByNode, sizeX, sizeZ])

  // ── Windowed DOM layer ──────────────────────────────────────────────────────
  const effectiveCellPx = BASE_CELL_PX * transform.scale
  const showIcons = effectiveCellPx >= ICON_LOD_THRESHOLD_PX

  const visibleRange = useMemo(
    () => getVisibleRange(
      { translateX: transform.x, translateY: transform.y, scale: transform.scale },
      containerSize,
      { sizeX, sizeZ },
      BASE_CELL_PX,
      OVERDRAW_CELLS,
    ),
    [transform, containerSize, sizeX, sizeZ],
  )

  const visibleCells = useMemo(() => {
    if (!showIcons || sizeX <= 0 || sizeZ <= 0) return []
    const cells: { x: number; z: number; node: number; pick: { primary: PlacedObject; group: GridGroup; count: number } }[] = []
    for (let z = visibleRange.zMin; z <= visibleRange.zMax; z++) {
      for (let x = visibleRange.xMin; x <= visibleRange.xMax; x++) {
        const node = z * sizeX + x
        const pick = primaryByNode.get(node)
        if (pick) cells.push({ x, z, node, pick })
      }
    }
    return cells
  }, [showIcons, visibleRange, sizeX, sizeZ, primaryByNode])

  // ── Hover / pin info panel ──────────────────────────────────────────────────
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const [pinnedNode, setPinnedNode] = useState<number | null>(null)
  const infoNode = pinnedNode ?? hoveredNode
  const infoItems = infoNode !== null ? tileIndex.get(infoNode) ?? [] : []

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={900}
        defaultHeight={650}
        minWidth={500}
        minHeight={360}
        storageKey="map-grid"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Map Grid</DialogTitle>

        {/* pr-10 clears the dialog's own [X] close button, which is absolutely
            positioned top-right independent of this row's flow — without it,
            wrapped content here can sit underneath and silently eat clicks. */}
        <DraggableDialogDragHandle className="flex flex-col gap-2 px-4 pt-2.5 pb-2 pr-10 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold shrink-0">Map Grid</span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 shrink-0" data-nodrag>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Zoom out"
                onClick={() => zoomAt(containerSize.width / 2, containerSize.height / 2, 0.8)}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Zoom in"
                onClick={() => zoomAt(containerSize.width / 2, containerSize.height / 2, 1.25)}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Fit to window"
                onClick={fitToViewport}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-1 flex-wrap" data-nodrag>
            {GRID_GROUP_ORDER.map((g) => (
              <button
                key={g}
                onClick={() => toggleGroup(g)}
                className={`h-6 px-2 text-xs rounded shrink-0 border transition-colors ${
                  filter[g]
                    ? 'bg-background text-foreground border-border'
                    : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
                }`}
                title={`Toggle ${GRID_GROUP_LABELS[g]}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                  style={{ backgroundColor: GROUP_COLORS[g], opacity: filter[g] ? 1 : 0.35 }}
                />
                {GRID_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </DraggableDialogDragHandle>

        <div className="flex-1 min-h-0 relative overflow-hidden bg-muted/30">
          {!context && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Load a .map file to see the grid.
            </div>
          )}

          {context && (sizeX <= 0 || sizeZ <= 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              This map has no known size.
            </div>
          )}

          {context && sizeX > 0 && sizeZ > 0 && (
            <div
              ref={setViewportEl}
              className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              onClick={() => setPinnedNode(null)}
            >
              <div
                className="absolute top-0 left-0"
                style={{
                  width: sizeX * BASE_CELL_PX,
                  height: sizeZ * BASE_CELL_PX,
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: '0 0',
                }}
              >
                {/* Overview swatch layer — always present, cheap regardless of map size */}
                <canvas
                  ref={setCanvasEl}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{
                    width: sizeX * BASE_CELL_PX,
                    height: sizeZ * BASE_CELL_PX,
                    imageRendering: 'pixelated',
                  }}
                />

                {/* Interactive icon layer — windowed to the visible range, only above the LOD threshold */}
                {showIcons && visibleCells.map(({ x, z, node, pick }) => {
                  const name = pick.primary.displayName || pick.primary.entitySid || pick.primary.sid
                  return (
                    <div
                      key={node}
                      className="absolute flex items-center justify-center hover:bg-accent/60 rounded-sm cursor-pointer"
                      style={{ left: x * BASE_CELL_PX, top: z * BASE_CELL_PX, width: BASE_CELL_PX, height: BASE_CELL_PX }}
                      onPointerEnter={() => setHoveredNode(node)}
                      onPointerLeave={() => setHoveredNode((cur) => (cur === node ? null : cur))}
                      onClick={(e) => { e.stopPropagation(); setPinnedNode((cur) => (cur === node ? null : node)) }}
                    >
                      <CatalogIcon iconId={pick.primary.sid} name={name} size={Math.min(BASE_CELL_PX - 4, 24)} />
                      {pick.count > 1 && (
                        <span className="absolute bottom-0 right-0 text-[9px] leading-none px-0.5 rounded bg-background/90 border border-border">
                          {pick.count}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Single shared hover/pin info panel — not one per cell */}
          {infoNode !== null && infoItems.length > 0 && (
            <div className="absolute bottom-2 left-2 max-w-xs bg-popover border border-border rounded-md shadow-md p-2 text-xs space-y-1 pointer-events-none">
              <p className="font-semibold">
                Tile ({infoNode % sizeX}, {Math.floor(infoNode / sizeX)}) — {infoItems.length} item{infoItems.length > 1 ? 's' : ''}
              </p>
              {infoItems.map((it, i) => (
                <p key={i} className="text-muted-foreground truncate">
                  {it.displayName || it.entitySid || it.sid}
                  {it.type === 2 && ' (unit)'}
                  {it.type === 1 && ' (zone marker)'}
                </p>
              ))}
            </div>
          )}
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
