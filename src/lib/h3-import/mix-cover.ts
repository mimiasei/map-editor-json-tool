// ─── Random mixes of OE objects over an H3 footprint ─────────────────────────────────────────────────────────────────────────────────────
// What the table's `mix` rows and sprite rules (h3-object-mapping-schema.ts: MixEntry) do: each blocked H3 tile draws an entry by weight, then an OE
// object from the entry's pool, avoiding the models standing right beside it (so a cluster is a mix, not one model repeated). With an accent list,
// one random tile of the object draws from that instead (a sand dune: hills, with one palm on top).

import type { GameCatalog } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import type { H3DecorationPicker } from './h3-decoration-pools'
import type { MixEntry } from './h3-object-mapping-schema'
import type { FootprintCell } from './scenery-clusters'

export interface MixPlacement { cell: FootprintCell; sid: string }

export interface MixCover {
  /** One placement per cell, or null when no entry has anything to draw from (an unknown sid, a prefix nothing matches): the object is then not a mix. */
  cover(cells: FootprintCell[], entries: MixEntry[], accent?: MixEntry[]): MixPlacement[] | null
}

export function createMixCover(catalog: GameCatalog, picker: H3DecorationPicker, rng: () => number): MixCover {
  const known = new Set(catalog.mapObjects.map((o) => o.id))
  const byPrefix = new Map<string, string[]>()
  const poolOf = (entry: MixEntry): string[] => {
    if (entry.sids) return entry.sids.filter((sid) => known.has(sid))
    if (entry.prefix) {
      let pool = byPrefix.get(entry.prefix)
      if (!pool) {
        pool = catalog.mapObjects.filter((o) => o.id.startsWith(entry.prefix as string) && (o.sizeX ?? 1) === 1 && (o.sizeZ ?? 1) === 1).map((o) => o.id)
        byPrefix.set(entry.prefix, pool)
      }
      return pool
    }
    return []
  }
  const treeBiomeOf = (entry: MixEntry): BiomeId | null => {
    if (!entry.trees) return null
    const biome = picker.biomeIdOf(entry.trees)
    return biome !== null && picker.hasTrees(biome) ? biome : null
  }
  const usable = (entries: MixEntry[]) => entries.filter((entry) => entry.weight > 0 && (entry.trees ? treeBiomeOf(entry) !== null : poolOf(entry).length > 0))

  const draw = (entries: MixEntry[], beside: (string | undefined)[]): string => {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = rng() * total
    let entry = entries[entries.length - 1]
    for (const candidate of entries) {
      if (roll < candidate.weight) { entry = candidate; break }
      roll -= candidate.weight
    }
    const biome = treeBiomeOf(entry)
    if (biome !== null) return picker.pickTree(biome, rng, beside.find((sid): sid is string => !!sid))
    const pool = poolOf(entry)
    const free = pool.filter((sid) => !beside.includes(sid))
    const from = free.length > 0 ? free : pool
    return from[Math.floor(rng() * from.length)]
  }

  return {
    cover(cells, entries, accent) {
      const main = usable(entries)
      if (main.length === 0) return null
      const accented = accent ? usable(accent) : []
      const accentIndex = accented.length > 0 ? Math.floor(rng() * cells.length) : -1
      const modelAt = new Map<string, string>()
      return cells.map((cell, index) => {
        const beside = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => modelAt.get(`${cell.x + dx},${cell.z + dz}`))
        const sid = draw(index === accentIndex ? accented : main, beside)
        modelAt.set(`${cell.x},${cell.z}`, sid)
        return { cell, sid }
      })
    },
  }
}
