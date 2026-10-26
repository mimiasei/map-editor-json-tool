// ─── Map context store ─────────────────────────────────────────────────────────
// Read-only data extracted from the loaded .map file.
// Not persisted. Not tracked in undo/redo.

import { create } from 'zustand'
import type { MapContext } from '@/types/map-context'

interface MapContextStore {
  context: MapContext | null
  /** Set the full context (called after parsing a .map file) */
  setContext: (ctx: MapContext) => void
  /** Clear context (called on New / reset) */
  clearContext: () => void
}

const NUMBER_LAYERS = ['tilesMap', 'waterMap', 'levelsMap', 'climbsMap', 'roadsMap', 'customAreasPainting'] as const

const sameNumbers = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

function sameRivers(a: MapContext['riverNodes'], b: MapContext['riverNodes']): boolean {
  if (a.size !== b.size) return false
  for (const [node, r] of a) {
    const o = b.get(node)
    if (!o || o.s !== r.s || o.isWaterfall !== r.isWaterfall) return false
  }
  return true
}

/**
 * Every edit rebuilds the whole context, so each per-tile layer is a new array even when the edit didn't touch it. The grid's canvas
 * layers redraw whenever such an array changes identity (a rotated tree repainted the terrain, cliffs and roads: ~2 s on a 256x256
 * map), so an unchanged layer keeps its previous reference.
 */
function shareUnchangedLayers(prev: MapContext | null, next: MapContext): MapContext {
  if (!prev) return next
  const shared: MapContext = { ...next }
  for (const key of NUMBER_LAYERS) {
    if (sameNumbers(prev[key], next[key])) shared[key] = prev[key]
  }
  if (sameRivers(prev.riverNodes, next.riverNodes)) shared.riverNodes = prev.riverNodes
  return shared
}

export const useMapContextStore = create<MapContextStore>()((set) => ({
  context: null,
  setContext: (ctx) => set((s) => ({ context: shareUnchangedLayers(s.context, ctx) })),
  clearContext: () => set({ context: null }),
}))
