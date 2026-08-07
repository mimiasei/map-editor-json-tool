// ─── Map Grid — per-cell icon/badge overrides (issue #127, extended #130) ───
// CatalogIcon's letter-fallback (name.charAt(0).toUpperCase()) is shared by
// unrelated parts of the app, so it's left untouched. These overrides are
// resolved here, ahead of CatalogIcon, only within the Map Grid's own
// rendering (both the grid cells in MapGridDialog.tsx and the info-column
// rows in MapGridCellContent.tsx call this, so the two stay visually
// consistent).
//
// issue #130: generalized to prefer a real extracted thumbnail when one is
// known, falling back to a manual icon/text override only when it isn't —
// spawners/zones have no real 2D texture at all (confirmed/assumed, so no
// check needed), but portals' real-icon status is unconfirmed, and squads
// should show a real creature icon whenever one resolves.

import { Castle, Shield, DoorOpen, SquareDashed, type LucideIcon } from 'lucide-react'
import { groupOf } from '@/lib/map-grid/tile-index'
import { thumbnailPath } from '@/lib/catalog/thumbnails'
import type { PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'

export type GridCellVisual =
  | { kind: 'icon'; Icon: LucideIcon }
  | { kind: 'text'; text: string }
  | { kind: 'catalog' }
  /** Real thumbnail, but under a different iconId/name than the item's own
   *  sid — e.g. a squad showing its first unit's creature icon. */
  | { kind: 'catalogOverride'; iconId: string; name: string }

/** No real 2D icon texture exists for these (confirmed in issue #125/#127's
 *  investigation) — always use the manual icon, no real-icon check needed. */
const SID_ICON_OVERRIDES: Record<string, LucideIcon> = {
  'city-spawner': Castle,
  'hero-spawner': Shield,
}

export function resolveGridCellVisual(item: PlacedObject, catalog: GameCatalog | null): GridCellVisual {
  // Zones (markers) — an invisible scripting area, never has a real texture.
  if (item.type === 1) return { kind: 'icon', Icon: SquareDashed }

  // Squads — show the first unit's real creature icon instead of the
  // squad's own (non-creature) sid, when one resolves.
  if (item.type === 2 && item.firstUnitSid) {
    const creature = catalog?.creatures.find((c) => c.id === item.firstUnitSid)
    if (creature?.icon && thumbnailPath(creature.icon)) {
      return { kind: 'catalogOverride', iconId: creature.icon, name: creature.name }
    }
  }

  const spawnerOverride = SID_ICON_OVERRIDES[item.sid]
  if (spawnerOverride) return { kind: 'icon', Icon: spawnerOverride }

  // Portals — unconfirmed whether the game ships a real 2D icon for these
  // (may be animated scene prefabs with none at all), so prefer a real
  // extracted thumbnail if the sidecar found one, only falling back to a
  // generic icon when it didn't — never mask a real icon that does exist.
  if (item.sid.startsWith('portal_')) {
    const catalogIcon = catalog?.mapObjects.find((o) => o.id === item.sid)?.icon
    if (catalogIcon && thumbnailPath(catalogIcon)) return { kind: 'catalog' }
    return { kind: 'icon', Icon: DoorOpen }
  }

  if (groupOf(item, catalog) === 'resources') return { kind: 'text', text: 'Res' }
  return { kind: 'catalog' }
}
