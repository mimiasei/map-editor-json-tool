// ─── Hero authoring helpers (issue #141) ─────────────────────────────────────
// Fields the game derives purely from a hero's fraction+classType (mesh,
// mounts, skillsRollVariant, starting stats/statsRolls) are computed here
// straight from whichever real hero in the loaded catalog already matches
// that combination, rather than a hand-written fraction/classType table —
// confirmed 1:1 for every real hero across all 6 factions (see the issue
// #141 plan), but deriving it live from the catalog means this stays correct
// automatically if Unfrozen ever ships a new faction or hero, instead of
// silently drifting out of sync with a hardcoded table.

import type { GameCatalog } from '@/lib/catalog/types'
import type { CustomHeroDefinition } from '@/types/hero'

function matchingRaws(catalog: GameCatalog | null, fraction: string, classType: string): Record<string, unknown>[] {
  if (!catalog || !fraction || !classType) return []
  return catalog.heroes
    .filter((h) => h.fraction === fraction && h.classType === classType && h.raw)
    .map((h) => h.raw as Record<string, unknown>)
}

/** Every distinct `mesh` value used by real heroes of this fraction+classType
 *  — normally exactly one, but returned as a list rather than assuming that. */
export function getMeshOptions(catalog: GameCatalog | null, fraction: string, classType: string): string[] {
  const meshes = new Set<string>()
  for (const raw of matchingRaws(catalog, fraction, classType)) {
    if (typeof raw.mesh === 'string' && raw.mesh) meshes.add(raw.mesh)
  }
  return Array.from(meshes)
}

/** The one mount sid real heroes of this fraction use (mount doesn't vary by
 *  classType — confirmed one mount per fraction across all 6 factions). */
export function getMountForFraction(catalog: GameCatalog | null, fraction: string): string | undefined {
  if (!catalog || !fraction) return undefined
  for (const h of catalog.heroes) {
    if (h.fraction !== fraction || !h.raw) continue
    const mounts = h.raw.mounts
    if (Array.isArray(mounts) && typeof mounts[0] === 'string' && mounts[0]) return mounts[0]
  }
  return undefined
}

/** skillsRollVariant is exactly `<factionFolder>_<classType>_skills_table`
 *  for every real hero — read straight off a matching one rather than
 *  reconstructing the string, since the faction *folder* name isn't always
 *  the same as the `fraction` field (e.g. necros folder -> fraction "undead"). */
export function getSkillsRollVariant(catalog: GameCatalog | null, fraction: string, classType: string): string | undefined {
  const raw = matchingRaws(catalog, fraction, classType)[0]
  return raw && typeof raw.skillsRollVariant === 'string' ? raw.skillsRollVariant : undefined
}

/** A representative real hero's `stats`/`statsRolls`, verbatim, to seed a new
 *  custom hero's starting point — per issue #141, statsRolls is never shown
 *  or edited in the dialog, just carried through from here untouched. */
export function getDefaultStatsAndRolls(
  catalog: GameCatalog | null,
  fraction: string,
  classType: string,
): { stats: Record<string, unknown>; statsRolls: unknown } | undefined {
  const raw = matchingRaws(catalog, fraction, classType)[0]
  if (!raw || typeof raw.stats !== 'object' || raw.stats === null) return undefined
  return { stats: raw.stats as Record<string, unknown>, statsRolls: raw.statsRolls }
}

/** Whether `id` already belongs to a real hero anywhere in the game
 *  (catalog.heroes already covers every faction/campaign/tutorial/
 *  custom_maps hero, since collectHeroes() reads DB/heroes/ recursively) or
 *  to a custom hero already authored on this map. Empty/whitespace-only ids
 *  are reported as not taken — the "required" check is a separate concern. */
export function isHeroIdTaken(
  id: string,
  catalog: GameCatalog | null,
  customHeroes: Record<string, CustomHeroDefinition>,
): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  if (trimmed in customHeroes) return true
  return (catalog?.heroes ?? []).some((h) => h.id === trimmed)
}
