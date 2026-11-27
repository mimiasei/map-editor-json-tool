// ─── Editing a row of the H3 → OE mapping table (the H3 Object Mapping tool) ─────────────────────────────────────────────────────────────
// The table has simple rows (an H3 object that is nothing, one OE object, or a scenery role) and rule rows (the result depends on the sprite, the
// subtype or the terrain). The tool edits the simple kinds with fields and every kind as JSON. These are the pure helpers for both.

import type { MixEntry, ObjectKind, ObjectRow, SceneryRole } from './h3-object-mapping-schema'
import { ObjectRowSchema } from './h3-object-mapping-schema'
import { SCENERY_GROUP_IDS } from './h3-object-mapping'

/** The H3 towns in the order of their subtype ids (Random Dwelling Faction, subtype 0 to 10; checked on a map with one of each). */
export const H3_TOWNS = ['Castle', 'Rampart', 'Tower', 'Inferno', 'Necropolis', 'Dungeon', 'Stronghold', 'Fortress', 'Conflux', 'Cove', 'Factory'] as const

/** The subtypes a row lists as rows of their own (one per H3 town), or none. */
export function subtypeRows(row: ObjectRow): number[] {
  return row.outcome === 'emit' && row.fractionBySubtype !== undefined ? H3_TOWNS.map((_, i) => i) : []
}

export type RowKind = 'omit' | 'emit' | 'scenery' | 'mix' | 'rule'

/** What a hero can do with the object: visit/pick it up (interactive), or it only decorates or marks terrain (scenery). Ids with no name are unknown. */
export type ObjectGroup = 'interactive' | 'scenery' | 'unknown'

/** Grouped by the shipped row, so editing what an object converts to never moves it between groups. */
export function objectGroup(defaultRow: ObjectRow): ObjectGroup {
  if (defaultRow.h3Name === 'Unidentified') return 'unknown'
  if (defaultRow.outcome.startsWith('scenery') || SCENERY_GROUP_IDS.has(defaultRow.h3Id)) return 'scenery'
  return 'interactive'
}

export function rowKind(row: ObjectRow): RowKind {
  if (row.outcome === 'omit' || row.outcome === 'emit' || row.outcome === 'scenery' || row.outcome === 'mix') return row.outcome
  return 'rule'
}

/** The row's `onWater` setting survives a change of kind: it is about the object, not about where it converts. */
function keepOnWater(row: ObjectRow): { onWater?: 'mountain' } {
  return 'onWater' in row && row.onWater ? { onWater: row.onWater } : {}
}

export const USER_REASON = 'user_mapping'

export function toOmit(row: ObjectRow, reason: string): ObjectRow {
  return { h3Id: row.h3Id, h3Name: row.h3Name, outcome: 'omit', reason: reason.trim() || USER_REASON, ...keepOnWater(row) }
}

export function toEmit(row: ObjectRow, sid: string, kind: ObjectKind): ObjectRow {
  // A random squad's faction and tier belong to the object, not to the sid typed here, so they survive a change of sid or kind.
  const squad = row.outcome === 'emit' ? { ...(row.fraction !== undefined && { fraction: row.fraction }), ...(row.tier !== undefined && { tier: row.tier }) } : {}
  return { h3Id: row.h3Id, h3Name: row.h3Name, outcome: 'emit', sid: sid.trim(), kind, reason: USER_REASON, ...squad }
}

export function toMix(row: ObjectRow, entries: MixEntry[]): ObjectRow {
  return { h3Id: row.h3Id, h3Name: row.h3Name, outcome: 'mix', entries }
}

export function toScenery(row: ObjectRow, role: SceneryRole): ObjectRow {
  return { h3Id: row.h3Id, h3Name: row.h3Name, outcome: 'scenery', role, ...keepOnWater(row) }
}

/** What an H3 object converts to, as one line: the OE sid, the scenery role, the reason it is dropped, or a note on a rule row. */
export function convertsToText(row: ObjectRow): string {
  switch (row.outcome) {
    case 'omit': return row.reason
    case 'emit': return row.sid
    case 'scenery': return row.role
    case 'dispatch': return ruleSummary('subtype / sprite', row.subtypes, row.exact, row.tokens)
    case 'scenery-dispatch': return ruleSummary('sprite', row.exact)
    case 'scenery-dispatch-subtype': return ruleSummary('subtype', row.subtypes)
    case 'landmark': return ruleSummary('sprite', row.exact)
    case 'mix': return row.entries.map((e) => `${mixEntryLabel(e)} ×${e.weight}`).join(', ')
  }
}

/** One mix entry as text: its objects, name prefix or tree biome. */
export function mixEntryLabel(entry: { sids?: string[]; prefix?: string; trees?: string }): string {
  if (entry.sids) return entry.sids.join('|')
  if (entry.prefix) return `${entry.prefix}*`
  if (entry.trees) return `trees(${entry.trees})`
  return '?'
}

function ruleSummary(by: string, ...tables: (Record<string, unknown> | undefined)[]): string {
  const entries = tables.reduce((sum, table) => sum + Object.keys(table ?? {}).length, 0)
  return `by ${by} (${entries})`
}

export function sameRow(a: ObjectRow, b: ObjectRow): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Parses edited JSON for the row of `h3Id`; returns the row or the reason it is not one. */
export function parseRowJson(text: string, h3Id: number): { row: ObjectRow } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  const parsed = ObjectRowSchema.safeParse(value)
  if (!parsed.success) return { error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') }
  if (parsed.data.h3Id !== h3Id) return { error: `h3Id must stay ${h3Id}` }
  return { row: parsed.data }
}
