// ─── Turning a planned paste into map edits ───────────────────────────────────
// Objects without extra properties go in one `paintObjects` batch (fast: a single rebuild). Anything that carries properties (guards, owners, reward
// slots, random-squad values...) and every squad is added one by one, because the property edits need the id the new instance got.
// The caller runs this inside `applyEditsAsOne`, so the whole paste is one undo step.

import type { MapSaveEdit } from '@/lib/map-save'
import type { PastePlacement } from '@/lib/map-grid/clipboard'

export interface PasteResult {
  placed: number
  /** Items left out because part of their footprint is off the map or on water / an elevation wall. */
  blocked: number
  /** Property edits that did not apply (the pasted object exists, but with the default value). */
  propsSkipped: number
}

type Apply = (edit: MapSaveEdit) => number | undefined

/**
 * `occupied` holds `sid@node` of the objects already on the map. The batch edit locates its additions by (sid, node), so an object that lands exactly on
 * an identical one (or on another copy in the same paste) is added on its own instead.
 */
export function applyPaste(placements: PastePlacement[], sizeX: number, apply: Apply, occupied: ReadonlySet<string>): PasteResult {
  const result: PasteResult = { placed: 0, blocked: 0, propsSkipped: 0 }
  const plain: { node: number; sid: string; rotation: number }[] = []
  const taken = new Set(occupied)
  for (const p of placements) {
    if (!p.ok) { result.blocked++; continue }
    const { item } = p
    const node = p.z * sizeX + p.x
    const spot = `${item.sid}@${node}`
    const duplicate = taken.has(spot)
    taken.add(spot)
    if (item.type === 0 && Object.keys(item.props).length === 0 && !duplicate) {
      plain.push({ node, sid: item.sid, rotation: item.rotation })
      continue
    }
    const id = apply({ kind: 'addObject', entityType: item.type, sid: item.sid, node, rotation: item.type === 0 ? item.rotation : undefined })
    result.placed++
    if (id === undefined) continue
    const props = item.props
    const edits: MapSaveEdit[] = []
    if (props.owner !== undefined) edits.push({ kind: 'setObjectOwner', entityType: item.type, entityId: id, owner: props.owner })
    if (props.guardUnitProps) edits.push({ kind: 'setGuardSquad', entityType: item.type, entityId: id, unitProps: props.guardUnitProps })
    if (props.randomSquadValue !== undefined) edits.push({ kind: 'setRandomSquadValue', entityType: item.type, entityId: id, requestedValue: props.randomSquadValue })
    if (props.randomSquadFraction !== undefined) edits.push({ kind: 'setRandomSquadFraction', entityType: item.type, entityId: id, fraction: props.randomSquadFraction })
    if (props.randomHireTier !== undefined || props.randomHireFraction !== undefined) {
      edits.push({ kind: 'setRandomHire', entityType: item.type, entityId: id, tier: props.randomHireTier, fraction: props.randomHireFraction })
    }
    if (props.rewardParams) edits.push({ kind: 'setRewardParams', entityType: item.type, entityId: id, parameters: props.rewardParams })
    if (props.displayName) edits.push({ kind: 'setDisplayName', entityType: item.type, entityId: id, nameTitle: props.displayName, description: props.description })
    for (const edit of edits) {
      // A property whose table row the new object lacks throws in the writer; the object itself stays, with its default.
      try { apply(edit) } catch { result.propsSkipped++ }
    }
  }
  if (plain.length > 0) {
    apply({ kind: 'paintObjects', additions: plain, deletions: [] })
    result.placed += plain.length
  }
  return result
}
