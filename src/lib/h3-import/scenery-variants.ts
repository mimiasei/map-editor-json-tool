// ─── Randomized decoration variety ───────────────────────────────────────────
// This is the actual payoff for the original ask that started issue #207:
// the reference translator collapses every H3 tree/rock/mountain variant to
// one fixed OE sid (or, disabled by default, cycles a hardcoded ~19-prefix
// allowlist round-robin — see `scenery_canon_postpass.py`). Here we instead
// auto-discover EVERY family of visually-interchangeable OE sids directly
// from the live catalog (stripping a trailing `_<n>` and requiring an
// identical footprint — no hardcoded prefix list, covers rocks/ruins/pools
// too) and pick a real random member per placement, reusing the same
// per-biome-pool-and-pick pattern already proven in `fuzzy-obstacle.ts`.

import type { CatalogMapObject } from '@/lib/catalog/types'

function familyStem(sid: string): string {
  return sid.replace(/_\d+$/, '')
}

function footprintFingerprint(obj: CatalogMapObject): string {
  const sizeX = obj.sizeX ?? 1
  const sizeZ = obj.sizeZ ?? 1
  const nodes = obj.nodes ?? [1]
  return `${sizeX}x${sizeZ}:${nodes.join(',')}`
}

/** Maps every catalog sid that has at least one same-footprint sibling
 *  (sharing its stem with the trailing `_<n>` stripped) to the full sibling
 *  group (itself included). A sid with no real siblings is simply absent —
 *  callers should fall back to the sid itself in that case. */
export function buildVariantFamilies(mapObjects: CatalogMapObject[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const obj of mapObjects) {
    const key = `${familyStem(obj.id)}|${footprintFingerprint(obj)}`
    const members = groups.get(key)
    if (members) members.push(obj.id)
    else groups.set(key, [obj.id])
  }
  const bySid = new Map<string, string[]>()
  for (const members of groups.values()) {
    if (members.length < 2) continue
    for (const member of members) bySid.set(member, members)
  }
  return bySid
}

/** Pick a random same-footprint sibling of `sid` (or `sid` itself if it has
 *  no real siblings). `rng` returns a float in [0, 1) — inject a seeded one
 *  for reproducible conversions, same convention as `fuzzy-obstacle.ts`. */
export function pickVariant(sid: string, families: Map<string, string[]>, rng: () => number): string {
  const family = families.get(sid)
  if (!family || family.length < 2) return sid
  return family[Math.floor(rng() * family.length)]
}

/** Small deterministic PRNG (mulberry32) so a given `.h3m` converts to the
 *  same decoration variety every time — reproducible for debugging/support,
 *  while different source maps still naturally look different. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit seed derived from a string (e.g. the source `.h3m` filename
 *  or map title) — cheap FNV-1a variant, no crypto import needed. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
