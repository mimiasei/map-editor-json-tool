// ─── Map Grid multi-selection (Select tool) ───────────────────────────────────
// A selection is a set of `PlacedObject.key`s (`${type}:${id}`, the only identity safe across objects/squads/markers).

import { isCopyable } from '@/lib/map-grid/clipboard'
import type { PlacedObject } from '@/types/map-context'

export type SelectMode = 'replace' | 'add' | 'toggle'

/** The new selection after `hits` were clicked or boxed: replace it, add to it (Ctrl + box) or flip each hit (Ctrl + click). */
export function combineSelection(prev: ReadonlySet<string>, hits: readonly string[], mode: SelectMode): Set<string> {
  if (mode === 'replace') return new Set(hits)
  const next = new Set(prev)
  for (const key of hits) {
    if (mode === 'toggle' && next.has(key)) next.delete(key)
    else next.add(key)
  }
  return next
}

/** Copyable objects that stand on any tile of the rectangle (an object counts on every solid footprint tile, like the tile index). */
export function keysInRectangle(
  minX: number, maxX: number, minZ: number, maxZ: number, sizeX: number,
  itemsAt: (node: number) => readonly PlacedObject[],
): string[] {
  const keys = new Set<string>()
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      for (const item of itemsAt(z * sizeX + x)) if (isCopyable(item)) keys.add(item.key)
    }
  }
  return [...keys]
}
