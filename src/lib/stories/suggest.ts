// Helpers that read the loaded map to pre-fill story slots and to name things
// in the generated text.

import type { MapContext } from '@/types/map-context'
import type { StorySlotDef, StoryDef } from '@/types/story'

export interface EntityOption {
  sid: string
  label: string
}

function usableName(name: string | undefined): string | undefined {
  const n = name?.trim()
  // "LOC:<sid>" means the real text lives in a token we do not resolve here.
  return n && !n.startsWith('LOC:') ? n : undefined
}

/** entity sid -> display name, for text like "the keep at Ravenhold". */
export function entityNameMap(ctx: MapContext | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!ctx) return out
  for (const e of ctx.entities) {
    const n = usableName(e.displayName)
    if (n) out[e.sid] = n
  }
  for (const p of ctx.placedObjects) {
    const n = usableName(p.displayName)
    if (p.entitySid && n) out[p.entitySid] = n
  }
  return out
}

/** Named entities on the map that fit a slot kind (towns, squads, other objects). */
export function entityOptions(ctx: MapContext | null, kind: StorySlotDef['entityKind']): EntityOption[] {
  if (!ctx) return []
  const names = entityNameMap(ctx)
  const seen = new Set<string>()
  const result: EntityOption[] = []
  for (const p of ctx.placedObjects) {
    const sid = p.entitySid
    if (!sid || seen.has(sid)) continue
    const fits = kind === 'town' ? !!p.isCity : kind === 'squad' ? p.type === 2 : p.type === 0 && !p.isCity
    if (!fits) continue
    seen.add(sid)
    result.push({ sid, label: names[sid] ?? sid })
  }
  return result
}

/** Pre-fills every slot with distinct suggestions so the user can just accept. */
export function suggestSlots(def: StoryDef, ctx: MapContext | null): Record<string, string[]> {
  const used = new Set<string>()
  const slots: Record<string, string[]> = {}
  for (const slot of def.slots) {
    const want = slot.cardinality === 'one' ? 1 : Math.max(slot.min, 1)
    const picks: string[] = []
    for (const o of entityOptions(ctx, slot.entityKind)) {
      if (picks.length >= want) break
      if (used.has(o.sid)) continue
      picks.push(o.sid)
      used.add(o.sid)
    }
    while (picks.length < want) picks.push('')
    slots[slot.id] = picks
  }
  return slots
}
