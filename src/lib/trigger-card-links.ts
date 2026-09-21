// ─── Card view sentence link actions ─────────────────────────────────────────
// Imperative helpers fired by clicking a linked token in a condition/action
// card's sentence (src/components/triggers/SentenceView.tsx) — kept as plain
// functions rather than a hook/store action since they compose three
// independent stores (map size, grid selection/focus, view switching) that
// don't otherwise need to know about each other.

import { useMapContextStore } from '@/store/useMapContextStore'
import { useMapGridStore } from '@/store/useMapGridStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'

/** Centers and zooms the Map Grid's viewport on the given node index, and
 *  selects it (opens the cell-info column) — does NOT switch views itself,
 *  since the node-edit "pick from map" flow (requestPick) already flips
 *  mapGridOpen on its own. Node -> (x,z) uses the same row-major indexing as
 *  every other node lookup in this codebase (node = z*sizeX + x, see
 *  CLAUDE.md). */
export function centerMapOnNode(node: number): void {
  const sizeX = useMapContextStore.getState().context?.sizeX
  if (sizeX) {
    useMapGridStore.getState().requestFocus(node % sizeX, Math.floor(node / sizeX))
  }
  useMapGridStore.getState().selectNode(node)
}

/** Switches to the Map Grid view, centered and zoomed in on the given node
 *  index — plain "go look at this node" navigation (no editing), used
 *  wherever a node reference doesn't have a param to write back into. */
export function openMapAtNode(node: number): void {
  centerMapOnNode(node)
  useViewBridgeStore.getState().openMapGrid()
}
