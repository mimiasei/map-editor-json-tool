// ─── Entity SID usage lookup ──────────────────────────────────────────────────
// Shared by ScenarioTree (sidebar bold+navigate, rename-dialog reference
// warning) and the Map Grid's Phase 2 tile editor (issue #122) — previously
// built once, inline, inside ScenarioTree only.

import type { ScenarioFile } from '@/types/scenario'

export type EntityUsage =
  | { type: 'trigger'; path: [number, number, number] }
  | { type: 'interruption'; path: [number] }

/** Every entitySid referenced by a trigger's/interruption's action or condition params, by sid. */
export function buildEntityUsageMap(scenario: ScenarioFile): Map<string, EntityUsage[]> {
  const map = new Map<string, EntityUsage[]>()
  const register = (sid: string, usage: EntityUsage) => {
    if (!map.has(sid)) map.set(sid, [])
    map.get(sid)!.push(usage)
  }
  for (const [qi, quest] of scenario.quests.entries()) {
    for (const [sqi, sq] of quest.subQuests.entries()) {
      for (const [ti, trigger] of sq.triggers.entries()) {
        const params = [
          ...trigger.actions.flatMap((a) => a.p ?? []),
          ...trigger.conditions.flatMap((c) => c.p ?? []),
        ]
        for (const p of params) {
          if (typeof p === 'string' && p) register(p, { type: 'trigger', path: [qi, sqi, ti] })
        }
      }
    }
  }
  for (const [ii, intr] of scenario.interruptions.entries()) {
    for (const p of intr.actions.flatMap((a) => a.p ?? [])) {
      if (typeof p === 'string' && p) register(p, { type: 'interruption', path: [ii] })
    }
  }
  return map
}

/** "trigger [0, 1, 2]"-style label for the rename dialog's reference warning list. */
export function describeEntityUsage(u: EntityUsage): string {
  return `${u.type} [${u.path.join(', ')}]`
}
