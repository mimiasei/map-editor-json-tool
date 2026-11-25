// ─── One encounter per tile ───────────────────────────────────────────────────
// The game does not load a map with two encounters (random-squads) on one tile. Placement refuses to create that (map-write.ts), but the
// placement auto-fix relocates guards and can still land one on another, so the passes that move things finish with this.

import type { PlacedObject } from '@/types/map-context'

/** Ids of the random-squads to delete so that no tile holds two. Of the squads on one tile one stays: preferably one that `may` not be
 *  changed (the user's own), else the lowest id; the others are listed when `may` allows touching them. */
export function duplicateEncounterIds(placedObjects: readonly PlacedObject[], may: (entityType: number, id: number) => boolean = () => true): number[] {
  const byNode = new Map<number, PlacedObject[]>()
  for (const o of placedObjects) {
    if (o.type !== 0 || o.sid !== 'random-squad') continue
    const list = byNode.get(o.node)
    if (list) list.push(o)
    else byNode.set(o.node, [o])
  }
  const doomed: number[] = []
  for (const list of byNode.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => Number(may(0, a.id)) - Number(may(0, b.id)) || a.id - b.id)
    for (const extra of list.slice(1)) if (may(0, extra.id)) doomed.push(extra.id)
  }
  return doomed
}
