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

/**
 * Build the extraction request for a loaded catalog. Names the sidecar cannot match
 * come back in its `missing` list and are otherwise harmless.
 */
export function buildIconRequests(catalog: GameCatalog | null): IconRequests {
  const icons: string[] = []
  const mapObjectIcons: string[] = []

  if (catalog) {
    for (const h of catalog.heroes) {
      if (!h.icon) continue
      icons.push(h.icon)
      icons.push(heroPortraitIcon(h.icon))
    }
    for (const c of catalog.creatures) if (c.icon) icons.push(c.icon)
    for (const a of catalog.artifacts) if (a.icon) icons.push(a.icon)
    for (const s of catalog.spells) if (s.icon) icons.push(s.icon)
    for (const s of catalog.skills) if (s.icon) icons.push(s.icon)
    for (const b of catalog.buffs) if (b.icon) icons.push(b.icon)
    for (const o of catalog.mapObjects) {
      // Only interactables and resources have a usable icon: theirs is derived from
      // the prefab path stem (e.g. "mine_gold") and matches a Texture2D m_Name.
      // environments/spawns have no map icon textures.
      if ((o.category === 'interactables' || o.category === 'resources') && o.icon) {
        mapObjectIcons.push(o.icon)
      }
    }
  }

  return {
    icons: [...new Set(icons)],
    mapObjectIcons: [...new Set(mapObjectIcons)],
  }
}
