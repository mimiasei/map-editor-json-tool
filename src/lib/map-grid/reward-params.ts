// ─── Map Grid — reward-slot decoding (objectsProperties.propRewardParams) ───
// Each raw slot string is one of three shapes, confirmed against real maps
// (plans/testItems-props-reference.md): "-" (unfilled), "resourceSid:amount"
// (e.g. "gold:3000"), or a bare artifact/skill sid — the last two are
// indistinguishable from each other by shape alone, so telling them apart
// needs a catalog lookup, which is why this lives outside map-extract.ts
// (a pure data-extraction module with no catalog access) rather than being
// decoded at extraction time.

import type { GameCatalog } from '@/lib/catalog/types'

/** One reward slot, classified — shared by the read-only formatter
 *  (formatRewardParam) and the editor (RewardSlotEditor, issue #143), so
 *  both agree on what a given raw string means. `kind: 'artifact'` is also
 *  the fallback for a sid that resolves as neither a known artifact nor a
 *  known skill (catalog not loaded, or genuinely unrecognized) — matches
 *  formatRewardParam's original lookup order, and keeps the value editable
 *  (as free text in an artifact combobox) rather than losing it. */
export type RewardParamClass =
  | { kind: 'empty' }
  | { kind: 'resource'; resource: string; amount: number }
  | { kind: 'artifact'; sid: string }
  | { kind: 'skill'; sid: string }

/** Classify one propRewardParams.parameters slot. */
export function classifyRewardParam(param: string, catalog: GameCatalog | null): RewardParamClass {
  if (param === '-') return { kind: 'empty' }

  const resourceMatch = param.match(/^([a-zA-Z]+):(\d+)$/)
  if (resourceMatch) {
    const [, resource, amount] = resourceMatch
    return { kind: 'resource', resource, amount: Number(amount) }
  }

  const artifact = catalog?.artifacts.find((a) => a.id === param)
  if (artifact) return { kind: 'artifact', sid: param }

  const skill = catalog?.skills.find((s) => s.id === param)
  if (skill) return { kind: 'skill', sid: param }

  return { kind: 'artifact', sid: param }
}

/** Inverse of classifyRewardParam — encodes an edited slot back to the raw
 *  string shape the .map file expects. */
export function encodeRewardParam(c: RewardParamClass): string {
  switch (c.kind) {
    case 'empty': return '-'
    case 'resource': return `${c.resource}:${c.amount}`
    case 'artifact':
    case 'skill':
      return c.sid
  }
}

/** Human-readable label for one propRewardParams.parameters slot. Falls
 *  back to the raw sid when it doesn't resolve against the catalog (e.g.
 *  no Core.zip loaded) rather than hiding it. */
export function formatRewardParam(param: string, catalog: GameCatalog | null): string {
  const c = classifyRewardParam(param, catalog)
  if (c.kind === 'empty') return '—'
  if (c.kind === 'resource') return `${c.amount} ${c.resource.charAt(0).toUpperCase()}${c.resource.slice(1)}`
  if (c.kind === 'artifact') {
    const artifact = catalog?.artifacts.find((a) => a.id === c.sid)
    if (artifact) return `${artifact.name} (artifact)`
  }
  if (c.kind === 'skill') {
    const skill = catalog?.skills.find((s) => s.id === c.sid)
    if (skill) return `${skill.name} (skill)`
  }
  return c.sid ?? param
}
