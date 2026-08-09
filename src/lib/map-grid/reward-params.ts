// ─── Map Grid — reward-slot decoding (objectsProperties.propRewardParams) ───
// Each raw slot string is one of three shapes, confirmed against real maps
// (plans/testItems-props-reference.md): "-" (unfilled), "resourceSid:amount"
// (e.g. "gold:3000"), or a bare artifact/skill sid — the last two are
// indistinguishable from each other by shape alone, so telling them apart
// needs a catalog lookup, which is why this lives outside map-extract.ts
// (a pure data-extraction module with no catalog access) rather than being
// decoded at extraction time.

import type { GameCatalog } from '@/lib/catalog/types'

/** Human-readable label for one propRewardParams.parameters slot. Falls
 *  back to the raw sid when it doesn't resolve against the catalog (e.g.
 *  no Core.zip loaded) rather than hiding it. */
export function formatRewardParam(param: string, catalog: GameCatalog | null): string {
  if (param === '-') return '—'

  const resourceMatch = param.match(/^([a-zA-Z]+):(\d+)$/)
  if (resourceMatch) {
    const [, resource, amount] = resourceMatch
    return `${amount} ${resource.charAt(0).toUpperCase()}${resource.slice(1)}`
  }

  const artifact = catalog?.artifacts.find((a) => a.id === param)
  if (artifact) return `${artifact.name} (artifact)`

  const skill = catalog?.skills.find((s) => s.id === param)
  if (skill) return `${skill.name} (skill)`

  return param
}
