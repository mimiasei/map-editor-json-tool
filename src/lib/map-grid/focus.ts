// ─── Where the Map Grid centres for an object ─────────────────────────────────
// A multi-tile object's x/z is only its anchor tile, so the camera goes to the middle of its icon footprint.

import type { GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { computeFootprintTiles, footprintIconBounds } from './footprint'

export function objectFocusPoint(item: PlacedObject, catalog: GameCatalog | null): { x: number; z: number } {
  const bounds = item.type === 0
    ? footprintIconBounds(computeFootprintTiles(catalog?.mapObjects.find((o) => o.id === item.sid), item.x, item.z, item.rotation))
    : null
  return bounds ? { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } : { x: item.x, z: item.z }
}
