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

import {
    Castle, Shield, DoorOpen, SquareDashed, Building2, UserRound, Swords, Gem, Package, Users,
    Trees, Mountain, MountainSnow, Flower2, Squirrel,
    CloudFog, Trophy, Waves, Flag, Box, Leaf, Tent, Pickaxe,
    type AppIcon } from '@/components/ui/icons'
import { groupOf } from '@/lib/map-grid/tile-index'
import { thumbnailPath } from '@/lib/catalog/thumbnails'
import { objectRender, type ObjectRender } from '@/lib/object-render/render-index'
import { randomSquadDifficultyLabel, squadValueFromUnits, type DifficultyRange } from '@/lib/map-grid/squad-pool'
import type { PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import type { CatalogMapObject } from '@/lib/catalog/types'
import { resolveDecorationSubcategory, type DecorationSubcategory } from '@/lib/map-grid/decoration-subcategories'
import { localName } from '@/lib/catalog/local-name'

export type GridCellVisual =
  | { kind: 'icon'; Icon: AppIcon; colorClassName?: string }
  | { kind: 'text'; text: string }
  | { kind: 'catalog' }
  /** Real thumbnail, but under a different iconId/name than the item's own
   *  sid — e.g. a squad showing its first unit's creature icon. */
  | { kind: 'catalogOverride'; iconId: string; name: string }
  /** The object rendered from the game's own prefab (see lib/object-render), drawn around the prefab's origin. */
  | { kind: 'render'; render: ObjectRender }

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
const SID_ICON_OVERRIDES: Record<string, AppIcon> = {
  'city-spawner': Castle,
  'hero-spawner': Shield,
  'random-city': Building2,
  'random-hero': UserRound,
  'random-squad': Swords,
  'random-res': Gem,
  'random-item': Package,
  'random-hire': Users,
  'squad': Swords,
}

const SUBCATEGORY_ICON_FALLBACK: Partial<Record<DecorationSubcategory, AppIcon>> = {
    animals: Squirrel,
    fx: CloudFog,
    mountains: Mountain,
    trees: Trees,
    rocks: Box,
    pools: Waves,
    hills: MountainSnow,
    walkable: Flower2,
    campaignRelated: Flag,
    other: Leaf,
}

const CATEGORY_ICON_FALLBACK: Partial<Record<CatalogMapObject['category'], AppIcon>> = {
    artifacts: Trophy,
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

const RESOURCE_COLOR: Record<string, string> = {
    resource_gold: 'fill-amber-300',
    resource_wood: 'fill-amber-700',
    resource_ore: 'fill-gray-500',
    resource_gemstones: 'fill-purple-400',
    resource_crystals: 'fill-rose-500',
    resource_mercury: 'fill-blue-200',
    resource_dust: 'fill-pink-300',
    chest: 'fill-blue-500',
    camp_fire: 'fill-orange-400',
}

const MINE_COLOR: Record<string, string> = {
    mine_gold: RESOURCE_COLOR.resource_gold,
    mine_wood: RESOURCE_COLOR.resource_wood,
    mine_ore: RESOURCE_COLOR.resource_ore,
    mine_gemstones: RESOURCE_COLOR.resource_gemstones,
    mine_crystals: RESOURCE_COLOR.resource_crystals,
    mine_mercury: RESOURCE_COLOR.resource_mercury,
}

/** The sid whose render stands for a placed object: its own, or for a city spawner with a chosen faction that faction's city. */
export function renderSidFor(item: { sid: string; spawnerInfo?: { factionSid?: string } }): string {
  const faction = item.spawnerInfo?.factionSid
  if (item.sid === 'city-spawner' && faction) return `${faction === 'necropolis' ? 'undead' : faction}_city`
  return item.sid
}

export function resolveGridCellVisual(
  item: PlacedObject,
  catalog: GameCatalog | null,
  squadDifficultyRanges?: DifficultyRange[],
  // false = the Map Grid's "Icon images" setting is off: never resolve to a real
  // thumbnail, so the generic Lucide icons below are used instead of the letter
  // badge CatalogIcon shows when it is told not to load an image.
  useImages = true,
): GridCellVisual {
  const hasThumbnail = (iconId: string | undefined): iconId is string => useImages && !!iconId && !!thumbnailPath(iconId)
  // Zones (markers) — an invisible scripting area, never has a real texture.
  if (item.type === 1) return { kind: 'icon', Icon: SquareDashed }

  // Squads — show the first unit's real creature icon instead of the
  // squad's own (non-creature) sid, when one resolves.
  if (item.type === 2 && item.firstUnitSid) {
    const creature = catalog?.creatures.find((c) => c.id === item.firstUnitSid)
    if (hasThumbnail(creature?.icon)) {
      return { kind: 'catalogOverride', iconId: creature.icon, name: localName(catalog, 'creatures', creature) }
    }
  }

  // A freshly-placed "random" squad (Object Browser Units mode) has no
  // propSquads row yet, so firstUnitSid above is unset — fall back to the
  // one-unit template's own creature, since that's the only creature it
  // could ever resolve to in-game.
  if (item.type === 2 && !item.firstUnitSid) {
    const template = catalog?.squadTemplates.find((t) => t.id === item.sid && t.unitSids.length === 1)
    const creature = template && catalog?.creatures.find((c) => c.id === template.unitSids[0])
    if (hasThumbnail(creature?.icon)) {
      return { kind: 'catalogOverride', iconId: creature.icon, name: localName(catalog, 'creatures', creature) }
    }
  }

  // A city spawner with a chosen faction is drawn as that faction's city (same 3x3 footprint and offsets as the spawner);
  // the player number is drawn over it by the grid. A random-faction spawner keeps its icon.
  const cityRender = useImages && item.sid === 'city-spawner' ? objectRender(renderSidFor(item)) : null
  if (cityRender) return { kind: 'render', render: cityRender }

  const spawnerKey = Object.keys(SID_ICON_OVERRIDES).find((k) => item.sid === k || item.sid.startsWith(k))
  const spawnerOverride = spawnerKey ? SID_ICON_OVERRIDES[spawnerKey] : undefined
  if (spawnerOverride) {
    if (item.sid === 'random-squad' && item.randomSquadValue !== undefined) {
      const label = randomSquadDifficultyLabel(item.randomSquadValue, squadDifficultyRanges)
      return { kind: 'icon', Icon: spawnerOverride, colorClassName: SQUAD_DIFFICULTY_COLOR[label] }
    }
    // Fixed (non-random) squad, no real creature icon to fall back to (see
    // the item.type === 2 checks above) — tint the Swords fallback by value
    // derived from its actual unit composition, same difficulty vocabulary
    // as random-squad above.
    if (item.sid === 'squad' && item.guardUnitProps) {
      const value = squadValueFromUnits(item.guardUnitProps, catalog)
      const label = randomSquadDifficultyLabel(value, squadDifficultyRanges)
      return { kind: 'icon', Icon: spawnerOverride, colorClassName: SQUAD_DIFFICULTY_COLOR[label] }
    }
    return { kind: 'icon', Icon: spawnerOverride }
  }

  // Renders win over the extracted icons and the generic mine/resource glyphs below.
  const render = useImages ? objectRender(item.sid) : null
  if (render) return { kind: 'render', render }

  // Portals — unconfirmed whether the game ships a real 2D icon for these
  // (may be animated scene prefabs with none at all), so prefer a real
  // extracted thumbnail if the sidecar found one, only falling back to a
  // generic icon when it didn't — never mask a real icon that does exist.
  if (item.sid.startsWith('portal_')) {
    const catalogIcon = catalog?.mapObjects.find((o) => o.id === item.sid)?.icon
    if (hasThumbnail(catalogIcon)) return { kind: 'catalog' }
    return { kind: 'icon', Icon: DoorOpen }
  }

  if (item.sid.startsWith('barracks_')) {
    const catalogIcon = catalog?.mapObjects.find((o) => o.id === item.sid)?.icon
    if (hasThumbnail(catalogIcon)) return { kind: 'catalog' }
    return { kind: 'icon', Icon: Tent }
  }

  if (item.sid.startsWith('mine_')) {
    const catalogIcon = catalog?.mapObjects.find((o) => o.id === item.sid)?.icon
    if (hasThumbnail(catalogIcon)) return { kind: 'catalog' }
    return { kind: 'icon', Icon: Pickaxe, colorClassName: MINE_COLOR[item.sid] }
  }

  if (groupOf(item, catalog) === 'resources') return { kind: 'icon', Icon: Gem, colorClassName: RESOURCE_COLOR[item.sid] }

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
  if (catalogEntry?.icon && catalogEntry.icon !== item.sid && hasThumbnail(catalogEntry.icon)) {
    return { kind: 'catalogOverride', iconId: catalogEntry.icon, name: localName(catalog, 'mapObjects', catalogEntry) }
  }

  if (hasThumbnail(catalogEntry?.icon)) return { kind: 'catalog' }

  if (catalogEntry?.category === 'environments' || catalogEntry?.category === 'animals' || catalogEntry?.category === 'fxs') {
    const subIcon = SUBCATEGORY_ICON_FALLBACK[resolveDecorationSubcategory(item.sid, catalogEntry.category)]
    if (subIcon) return { kind: 'icon', Icon: subIcon }
  }

  const categoryIcon = catalogEntry?.category ? CATEGORY_ICON_FALLBACK[catalogEntry.category] : undefined
  if (categoryIcon) return { kind: 'icon', Icon: categoryIcon }

  return { kind: 'catalog' }
}
