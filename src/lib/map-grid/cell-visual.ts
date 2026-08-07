// ─── Map Grid — per-cell icon/badge overrides (issue #127) ──────────────────
// CatalogIcon's letter-fallback (name.charAt(0).toUpperCase()) is shared by
// unrelated parts of the app, so it's left untouched. These overrides are
// resolved here, ahead of CatalogIcon, only within the Map Grid's own
// rendering (both the grid cells in MapGridDialog.tsx and the info-column
// rows in MapGridCellContent.tsx call this, so the two stay visually
// consistent) — city-spawner/hero-spawner get a real icon instead of "C"/"H",
// and every resource (including "chest", which shares the same category and
// otherwise showed "C" — colliding with city-spawner) gets a "Res" badge
// instead of a single letter derived from names like "resource_gold".

import { Castle, Shield, type LucideIcon } from 'lucide-react'
import { groupOf } from '@/lib/map-grid/tile-index'
import type { PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'

export type GridCellVisual =
  | { kind: 'icon'; Icon: LucideIcon }
  | { kind: 'text'; text: string }
  | { kind: 'catalog' }

const SID_ICON_OVERRIDES: Record<string, LucideIcon> = {
  'city-spawner': Castle,
  'hero-spawner': Shield,
}

export function resolveGridCellVisual(item: PlacedObject, catalog: GameCatalog | null): GridCellVisual {
  const override = SID_ICON_OVERRIDES[item.sid]
  if (override) return { kind: 'icon', Icon: override }
  if (groupOf(item, catalog) === 'resources') return { kind: 'text', text: 'Res' }
  return { kind: 'catalog' }
}
