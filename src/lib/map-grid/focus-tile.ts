// Jump to a tile in the Map Grid: opens it, selects the tile and zooms to it. Shared by every list of map problems (Validate, the post-save warning).

import { useMapGridStore } from '@/store/useMapGridStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'

export function focusTileInMapGrid(x: number, z: number, node: number): void {
  useViewBridgeStore.getState().openMapGrid()
  useMapGridStore.getState().selectNode(node)
  useMapGridStore.getState().requestFocus(x, z)
}
