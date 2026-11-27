// ─── Editing a row of the H3 → OE mapping table (the H3 Object Mapping tool) ─────────────────────────────────────────────────────────────
// The table has simple rows (an H3 object that is nothing, one OE object, or a scenery role) and rule rows (the result depends on the sprite, the
// subtype or the terrain). The tool edits the simple kinds with fields and every kind as JSON. These are the pure helpers for both.

import type { ObjectKind, ObjectRow, SceneryRole } from './h3-object-mapping-schema'
import { ObjectRowSchema } from './h3-object-mapping-schema'

export type RowKind = 'omit' | 'emit' | 'scenery' | 'rule'

export function rowKind(row: ObjectRow): RowKind {
  if (row.outcome === 'omit' || row.outcome === 'emit' || row.outcome === 'scenery') return row.outcome
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
  return { h3Id: row.h3Id, h3Name: row.h3Name, outcome: 'emit', sid: sid.trim(), kind, reason: USER_REASON }
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
  }
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
