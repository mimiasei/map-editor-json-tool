// ─── Zone & object actions as JSON documents ─────────────────────────────────
// The JSON column shows Block 2's propActionsBefore / propActionsAfter tables as `{"array": [...]}`, like the
// other map-side documents. Rows are joined on (type, id): type 0 object, 1 zone, 2 squad.

export type ActionTableKind = 'before' | 'after'

/** Parses an edited document and returns the rows, or throws a message naming the first problem. */
export function parseActionTableDoc(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text) as { array?: unknown } | null
  if (!Array.isArray(parsed?.array)) throw new Error('Expected an object with an "array" field, e.g. {"array": [...]}')
  const seen = new Set<string>()
  return parsed.array.map((raw, n) => {
    const row = raw as Record<string, unknown>
    const where = `Row ${n + 1}`
    if (![0, 1, 2].includes(Number(row.type))) throw new Error(`${where}: "type" must be 0 (object), 1 (zone) or 2 (squad)`)
    if (!Number.isInteger(row.id)) throw new Error(`${where}: "id" must be a whole number`)
    const key = `${row.type}:${row.id}`
    if (seen.has(key)) throw new Error(`${where}: type ${row.type} id ${row.id} appears twice`)
    seen.add(key)
    if (typeof row.repeat !== 'boolean') throw new Error(`${where}: "repeat" must be true or false`)
    if (typeof row.sides !== 'string') throw new Error(`${where}: "sides" must be a string ("" for any player)`)
    if (!Array.isArray(row.actions)) throw new Error(`${where}: "actions" must be a list`)
    const actions = row.actions.map((a, i) => {
      const action = a as Record<string, unknown>
      if (typeof action.a !== 'string' || action.a === '') throw new Error(`${where}, action ${i + 1}: "a" must be an action type`)
      if (!Array.isArray(action.p) || action.p.some((v) => typeof v !== 'string')) {
        throw new Error(`${where}, action ${i + 1}: "p" must be a list of strings`)
      }
      return { comment: typeof action.comment === 'string' ? action.comment : '', p: action.p, a: action.a }
    })
    return { ...row, actions }
  })
}
