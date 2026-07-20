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

export const useMapContextStore = create<MapContextStore>()((set) => ({
  context: null,
  setContext: (ctx) => set({ context: ctx }),
  clearContext: () => set({ context: null }),
}))
