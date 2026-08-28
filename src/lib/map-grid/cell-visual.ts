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

import { Castle, Shield, DoorOpen, SquareDashed, Building2, UserRound, Swords, Gem, Package, Users, type LucideIcon } from 'lucide-react'
import { groupOf } from '@/lib/map-grid/tile-index'
import { thumbnailPath } from '@/lib/catalog/thumbnails'
import { randomSquadDifficultyLabel, type DifficultyRange } from '@/lib/map-grid/squad-pool'
import type { PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'

export type GridCellVisual =
  | { kind: 'icon'; Icon: LucideIcon; colorClassName?: string }
  | { kind: 'text'; text: string }
  | { kind: 'catalog' }
  /** Real thumbnail, but under a different iconId/name than the item's own
   *  sid — e.g. a squad showing its first unit's creature icon. */
  | { kind: 'catalogOverride'; iconId: string; name: string }

/** No real 2D icon texture exists for these (confirmed in issue #125/#127's
 *  investigation) — always use the manual icon, no real-icon check needed.
 *  Bug fix: the other 6 entries of Core/DB/map/objects/7_spawns.json
 *  (random-city/random-hero/random-squad/random-res/random-item/random-hire
 *  — the map editor's randomized-spawn placeholder markers) had no entry
 *  here, so they fell through to CatalogIcon's letter-fallback badge, which
 *  has an opaque `bg-muted` background — masking the blue 'spawners' canvas
 *  swatch underneath and making them look gray instead of blue like
 *  city-spawner/hero-spawner (whose transparent Lucide icons let the swatch
 *  show through). Originally all 6 shared one Dices icon (a plain
 *  "randomized" indicator) — per user feedback that made them impossible to
 *  tell apart on the grid, each now gets its own distinct icon instead,
 *  matching what it actually spawns. */
const SID_ICON_OVERRIDES: Record<string, LucideIcon> = {
  'city-spawner': Castle,
  'hero-spawner': Shield,
  'random-city': Building2,
  'random-hero': UserRound,
  'random-squad': Swords,
  'random-res': Gem,
  'random-item': Package,
  'random-hire': Users,
}

/** issue #205: tints the random-squad Swords icon by rolled difficulty so it
 *  reads at a glance without opening the tile inspector — colors chosen for
 *  contrast against the spawners group's blue canvas swatch. Black (no
 *  override, default currentColor) for a freshly Object-Browser-placed
 *  instance with no propRandomSquads row yet (randomSquadValue undefined). */
const SQUAD_DIFFICULTY_COLOR: Record<string, string> = {
  Easy: 'text-green-400',
  Normal: 'text-white',
  Difficult: 'text-yellow-300',
  Impossible: 'text-orange-400',
  Lethal: 'text-red-500',
}

export function resolveGridCellVisual(item: PlacedObject, catalog: GameCatalog | null, squadDifficultyRanges?: DifficultyRange[]): GridCellVisual {
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

  // A freshly-placed "random" squad (Object Browser Units mode) has no
  // propSquads row yet, so firstUnitSid above is unset — fall back to the
  // one-unit template's own creature, since that's the only creature it
  // could ever resolve to in-game.
  if (item.type === 2 && !item.firstUnitSid) {
    const template = catalog?.squadTemplates.find((t) => t.id === item.sid && t.unitSids.length === 1)
    const creature = template && catalog?.creatures.find((c) => c.id === template.unitSids[0])
    if (creature?.icon && thumbnailPath(creature.icon)) {
      return { kind: 'catalogOverride', iconId: creature.icon, name: creature.name }
    }
  }

  const spawnerOverride = SID_ICON_OVERRIDES[item.sid]
  if (spawnerOverride) {
    if (item.sid === 'random-squad' && item.randomSquadValue !== undefined) {
      const label = randomSquadDifficultyLabel(item.randomSquadValue, squadDifficultyRanges)
      return { kind: 'icon', Icon: spawnerOverride, colorClassName: SQUAD_DIFFICULTY_COLOR[label] }
    }
    return { kind: 'icon', Icon: spawnerOverride }
  }

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

  // A "custom_" object (e.g. custom_windmill) is a scripting-only variant of
  // its base object (windmill) — same prefab/texture, just wrapped so it can
  // carry an entity SID. The catalog already resolves this correctly
  // (collectMapObjects derives `icon` from the shared `prefs[0]` path stem,
  // confirmed identical between custom_windmill and windmill), but every
  // caller here was passing the placed instance's own sid straight to
  // CatalogIcon instead of the catalog's resolved icon — which only ever
  // matches a real extracted thumbnail file for the base object's name, not
  // the custom_-prefixed one. Preferring the catalog's `icon` field whenever
  // it differs from the item's own sid fixes this in general, not just for
  // custom_* specifically.
  const catalogEntry = catalog?.mapObjects.find((o) => o.id === item.sid)
  if (catalogEntry?.icon && catalogEntry.icon !== item.sid) {
    return { kind: 'catalogOverride', iconId: catalogEntry.icon, name: catalogEntry.name }
  }
  return { kind: 'catalog' }
}
