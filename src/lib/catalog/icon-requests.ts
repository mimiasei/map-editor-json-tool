// ─── Which icons the thumbnail sidecar should extract ─────────────────────────
// Shared by the first-run wizard (SetupDialog) and the manual re-run
// (ThumbnailExtractDialog), which previously built this list twice and could drift.

import type { GameCatalog } from '@/lib/catalog/types'

export interface IconRequests {
  /** Matched against Texture2D names as-is. */
  icons: string[]
  /** Map object icons, matched with a 64×64 size preference by the sidecar. */
  mapObjectIcons: string[]
}

/**
 * Ground textures the Map Grid can lay under the terrain colours, by tile biome id (see BIOME_NAMES) plus water. Verified in
 * the game data: each name exists once as a 1024x1024 Texture2D, so the sidecar saves it as `thumbnails/<name>.png` like an icon.
 */
export const BIOME_TEXTURE_ICONS = {
  1: 'minimap_grass_biom',
  2: 'minimap_sand_biom',
  3: 'minimap_dead_biom',
  4: 'minimap_snow_biom',
  5: 'minimap_autumn_biom',
  6: 'minimap_lava_biom',
  7: 'minimap_dirt_biom',
  water: 'minimap_water',
} as const

/**
 * Layer textures and the splat map the game blends into its ground (verified in the game data: materials such as
 * `humanbase_mt` list these as their `_Texture0..3`, and `splat_map1` is a 2048x2048 RGBA Texture2D). See TERRAIN_RECIPES in
 * `map-grid/terrain-textures.ts`, which holds the per-biome layer lists.
 */
export const TERRAIN_LAYER_ICONS = [
  'splat_map1',
  'grass1', 'grass2', 'grass_dirt',
  'sand2', 'sand3',
  'dead_ground1', 'dead_ground2', 'dead_grass2',
  'Snow2', 'Snow4',
  'autumn_ground1', 'autumn_ground2', 'autumn_ground4',
  'lava_cracks', 'lava_blank', 'lava_glowy',
  'dirt_ground1', 'dirt_ground2', 'dirt_ground3',
] as const

/** Suffix of the large hero portraits — see heroPortraitIcon(). */
export const LARGE_PORTRAIT_SUFFIX = '_large'

/**
 * The `icons/hero_large_portraits/<icon>_large` texture, which is what dialogs use
 * as the speaker portrait: every such avatar in the shipped dialogs resolves to a
 * hero's `<icon>_large`. Requested alongside the plain card icon so the picker can
 * show real portraits and fall back when a hero has no large variant (one does not).
 */
export function heroPortraitIcon(icon: string): string {
  return `${icon}${LARGE_PORTRAIT_SUFFIX}`
}

/** Directory the shipped dialogs use when an avatar is a hero rather than a unit. */
export const HERO_AVATAR_DIR = 'icons/hero_large_portraits'

/**
 * The avatar `icon` value to write when an avatar should be a given hero.
 *
 * Verified against Core.zip: of the 123 distinct avatar icon references in the shipped
 * dialogs, 13 sit under `icons/hero_large_portraits/`, and every one of them is exactly
 * `<hero.icon>_large` for a real hero record. So this is the game's own convention, not
 * a guess — e.g. hero `mouaren` (icon `hero_dungeon_5_Mouaren`) becomes
 * `icons/hero_large_portraits/hero_dungeon_5_Mouaren_large`.
 *
 * Note the argument is the hero's `icon`, not its SID: those differ (SID `mouaren` vs
 * icon `hero_dungeon_5_Mouaren`), and only the icon appears in the path.
 */
export function heroAvatarIcon(heroIcon: string): string {
  return `${HERO_AVATAR_DIR}/${heroPortraitIcon(heroIcon)}`
}

/**
 * Last path segment of an asset reference.
 *
 * Dialog avatars are stored as full paths ("icons/dialogue/dialogue_unit_peasant"),
 * but the sidecar matches Unity `Texture2D.m_Name`, which is only the leaf. Both the
 * extraction request and the later lookup have to use the leaf, or nothing matches.
 */
export function assetLeafName(assetPath: string): string {
  return assetPath.split('/').pop() ?? assetPath
}

/**
 * Avatar icon references worth asking the extractor for.
 *
 * Shipped dialogs contain a handful of malformed entries — bare numbers from
 * `avatars.icons` arrays — which would only ever come back as "missing", so they are
 * dropped rather than reported as failures.
 */
export function avatarIconRequests(avatarIcons: string[]): string[] {
  const out = new Set<string>()
  for (const ref of avatarIcons) {
    const leaf = assetLeafName(ref).trim()
    if (!leaf || /^\d+$/.test(leaf)) continue
    out.add(leaf)
  }
  return [...out]
}

/**
 * Build the extraction request for a loaded catalog. Names the sidecar cannot match
 * come back in its `missing` list and are otherwise harmless.
 */
export function buildIconRequests(catalog: GameCatalog | null): IconRequests {
  const icons: string[] = []
  const mapObjectIcons: string[] = []

  // Not catalog data, so they are requested even before a catalog is loaded.
  icons.push(...Object.values(BIOME_TEXTURE_ICONS), ...TERRAIN_LAYER_ICONS)

  if (catalog) {
    for (const h of catalog.heroes) {
      if (!h.icon) continue
      icons.push(h.icon)
      icons.push(heroPortraitIcon(h.icon))
    }
    // Dialogue avatar portraits. These were previously never requested, so no PNG
    // ever existed and the Dialog Editor could not show an avatar however it tried.
    icons.push(...avatarIconRequests(catalog.dialogAvatarIcons ?? []))
    for (const c of catalog.creatures) if (c.icon) icons.push(c.icon)
    for (const a of catalog.artifacts) if (a.icon) icons.push(a.icon)
    for (const s of catalog.spells) if (s.icon) icons.push(s.icon)
    for (const s of catalog.skills) if (s.icon) icons.push(s.icon)
    for (const b of catalog.buffs) if (b.icon) icons.push(b.icon)
    // Every map-object category derives its icon from the prefab path stem
    // (e.g. "tree_dirt_1"), same convention as interactables/resources — the
    // old restriction to just those two categories predates full 9-category
    // coverage (issue #122 Phase 0) and meant environments/spawns/animals/
    // fxs/artifacts/blocks/test never had their PNGs requested at all,
    // regardless of how well the catalog itself resolved them.
    for (const o of catalog.mapObjects) {
      if (o.icon) mapObjectIcons.push(o.icon)
    }
  }

  return {
    icons: [...new Set(icons)],
    mapObjectIcons: [...new Set(mapObjectIcons)],
  }
}

// ─── Knowing when a re-run is needed ──────────────────────────────────────────
// Every time this module learns to ask for more artwork — hero portraits, dialogue
// avatars — anyone who already extracted is silently short of it, with nothing in the
// UI suggesting a remedy. So record what was asked for and compare.
//
// Deliberately NOT "is everything in the manifest?": a couple of requested textures do
// not exist in the game at all (hero_campaign_10_dragonfly_king_large,
// dialogue_unit_sunlight_cavalry_upg), so that test never reaches zero and would nag
// forever. Diffing against the last request set means permanently-absent textures are
// asked for once, recorded, and never mentioned again.

const REQUESTS_KEY = 'oe-thumbnails-requested'

function allNames({ icons, mapObjectIcons }: IconRequests): string[] {
  return [...new Set([...icons, ...mapObjectIcons])]
}

/** Remember what this extraction asked for. Call after a successful run. */
export function recordExtractedRequests(requests: IconRequests): void {
  try {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(allNames(requests).sort()))
  } catch {
    // Private mode or quota — the prompt reappearing is a far smaller problem than
    // failing the extraction that just succeeded.
  }
}

function storedRequests(): Set<string> | null {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((n): n is string => typeof n === 'string'))
  } catch {
    return null
  }
}

/**
 * The part of `requests` the last extraction never asked for, or null when nothing was recorded (then everything is new and the
 * caller should extract it all). The sidecar merges its manifest, so extracting only these keeps what is already there.
 */
export function onlyNewRequests(requests: IconRequests): IconRequests | null {
  const previous = storedRequests()
  if (!previous) return null
  return {
    icons: requests.icons.filter((n) => !previous.has(n)),
    mapObjectIcons: requests.mapObjectIcons.filter((n) => !previous.has(n)),
  }
}

/**
 * Names the app wants that the last extraction never asked for.
 *
 * With nothing recorded — either a first run, or an install that extracted before this
 * bookkeeping existed — everything counts as new, which is exactly the situation that
 * needs announcing.
 */
export function newlyRequestedIcons(requests: IconRequests): string[] {
  const current = allNames(requests)
  if (current.length === 0) return []
  const previous = storedRequests()
  if (!previous) return current
  return current.filter((name) => !previous.has(name))
}
