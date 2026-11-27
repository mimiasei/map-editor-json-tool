// Footprint size buckets of a map object, shared by the Map Grid object browser and the Game Database filter: 1x1, 2x2, 3x3, or "other"
// (non-square, 4x4 and up).

import type { CatalogMapObject } from '@/lib/catalog/types'
import { computeFootprintTiles, footprintIconBounds } from '@/lib/map-grid/footprint'

export const SIZE_ORDER = ['1x1', '2x2', '3x3', 'other'] as const
export type SizeKey = (typeof SIZE_ORDER)[number]

/** Visual footprint ("1" cells only, as the grid draws it) as "WxH"; objects with no footprint count as 1x1. */
export function objectSizeLabel(o: CatalogMapObject): string {
  const b = footprintIconBounds(computeFootprintTiles(o, 0, 0))
  return b ? `${b.maxX - b.minX + 1}x${b.maxZ - b.minZ + 1}` : '1x1'
}

/** The bucket a size label falls into. */
export function sizeKeyOf(label: string): SizeKey {
  return (SIZE_ORDER as readonly string[]).includes(label) ? (label as SizeKey) : 'other'
}
