// ─── Which object is on top when several share a tile ────────────────────────
// GME lets objects be placed on top of each other (a tree on a mountain's tile): the one placed last is drawn in front. A `.map` keeps
// objects grouped by sid with ever-growing ids, so a higher id = placed later; there is no field for a drawing order, so a manual
// rearrangement lives only in the editor (useStackOrderStore) and is not written to the `.map`.

import type { PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { isGroundCoverSid } from '@/lib/map-grid/decoration-subcategories'

/** Walkable ground clutter lies under everything, zones under objects, units (squads) over everything. */
function tier(item: PlacedObject, catalog: GameCatalog | null): number {
  if (item.type === 2) return 3
  if (item.type === 1) return 1
  return isGroundCoverSid(item.sid, catalog) ? 0 : 2
}

/**
 * One tile's items, top of the stack first. By default units, then the newest object, down to ground cover. `manual` is the user's own
 * arrangement of this tile (keys, top first): items listed there keep that order, anything not listed (placed since) goes on top.
 */
export function orderStack(items: readonly PlacedObject[], catalog: GameCatalog | null, manual?: readonly string[]): PlacedObject[] {
  const byDefault = (a: PlacedObject, b: PlacedObject) => tier(b, catalog) - tier(a, catalog) || b.id - a.id || (a.key < b.key ? -1 : 1)
  if (!manual || manual.length === 0) return [...items].sort(byDefault)
  const rank = new Map(manual.map((key, i) => [key, i]))
  const fresh = items.filter((i) => !rank.has(i.key)).sort(byDefault)
  const arranged = items.filter((i) => rank.has(i.key)).sort((a, b) => rank.get(a.key)! - rank.get(b.key)!)
  return [...fresh, ...arranged]
}

/**
 * Painting order for icons. Starts from the usual one (screen row, then column: lower right in front) and then makes every object come
 * after the one under it on each tile they share, so the stack order wins over the position. `stackByNode` lists object keys per tile,
 * top first. A conflicting arrangement (A over B on one tile, B over A on another) keeps the first one met rather than looping.
 */
export function layerOrder<T extends { key: string; row: number; col: number; nodes: readonly number[] }>(entries: T[], stackByNode: ReadonlyMap<number, readonly string[]>): T[] {
  const base = [...entries].sort((a, b) => a.row - b.row || a.col - b.col)
  const byKey = new Map(base.map((e) => [e.key, e]))
  const done = new Set<string>()
  const visiting = new Set<string>()
  const out: T[] = []
  const emit = (entry: T) => {
    if (done.has(entry.key) || visiting.has(entry.key)) return
    visiting.add(entry.key)
    for (const node of entry.nodes) {
      const stack = stackByNode.get(node)
      if (!stack) continue
      const at = stack.indexOf(entry.key)
      // The next one down that is drawn at all (filtered-out objects are not in `entries`).
      for (let i = at + 1; at >= 0 && i < stack.length; i++) {
        const below = byKey.get(stack[i])
        if (below) { emit(below); break }
      }
    }
    visiting.delete(entry.key)
    done.add(entry.key)
    out.push(entry)
  }
  for (const entry of base) emit(entry)
  return out
}
