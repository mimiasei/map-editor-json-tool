// ─── Map Grid selection store ────────────────────────────────────────────────
// Which tile is selected in the Map Grid dialog's cell-info column (issue
// #125). Kept in its own store (rather than local useState in
// MapGridDialog.tsx) so AppShell's panel-sync broadcast effect can read it
// via getState() for the undocked cross-window mirror, same as it already
// does for useScenarioStore/useMapContextStore.

import { create } from 'zustand'

interface MapGridStore {
  /** Tile node clicked in the grid, or null if none/cleared. */
  selectedNode: number | null
  /** True once the user closes the column via its own X — the column stays
   *  hidden until a new cell is clicked (selectNode always reopens it). */
  columnClosed: boolean
  selectNode: (node: number) => void
  closeColumn: () => void
}

export const useMapGridStore = create<MapGridStore>((set) => ({
  selectedNode: null,
  columnClosed: false,
  selectNode: (node) => set({ selectedNode: node, columnClosed: false }),
  closeColumn: () => set({ columnClosed: true }),
}))
