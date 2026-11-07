// ─── Map Grid selection store ────────────────────────────────────────────────
// Which tile is selected in the Map Grid dialog's cell-info column (issue
// #125). Kept in its own store (rather than local useState in
// MapGridDialog.tsx) so AppShell's panel-sync broadcast effect can read it
// via getState() for the undocked cross-window mirror, same as it already
// does for useScenarioStore/useMapContextStore.

import { create } from 'zustand'
import type { ObjectClipboard } from '@/lib/map-grid/clipboard'

interface MapGridStore {
  /** Tile node clicked in the grid, or null if none/cleared. */
  selectedNode: number | null
  /** True once the user closes the column via its own X — the column stays
   *  hidden until a new cell is clicked (selectNode always reopens it). */
  columnClosed: boolean
  focusRequest: FocusRequest | null
  /** Copied objects (Ctrl+C in the Select tool). Kept here, not in the dialog, so it survives closing the Map Grid. */
  clipboard: ObjectClipboard | null
  setClipboard: (clipboard: ObjectClipboard | null) => void
  selectNode: (node: number) => void
  closeColumn: () => void
  requestFocus: (x: number, z: number) => void
  clearFocusRequest: () => void
}

interface FocusRequest { x: number; z: number; requestId: number }

let nextFocusRequestId = 0

export const useMapGridStore = create<MapGridStore>((set) => ({
    selectedNode: null,
    columnClosed: false,
    focusRequest: null,
    clipboard: null,
    setClipboard: (clipboard) => set({ clipboard }),
    selectNode: (node) => set({ selectedNode: node, columnClosed: false }),
    closeColumn: () => set({ columnClosed: true }),
    requestFocus: (x, z) => set({ focusRequest: { x, z, requestId: ++nextFocusRequestId } }),
    clearFocusRequest: () => set({ focusRequest: null }),
}))
