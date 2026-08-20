// ─── Entity SID usage lookup ──────────────────────────────────────────────────
// Shared by ScenarioTree (sidebar bold+navigate, rename-dialog reference
// warning) and the Map Grid's Phase 2 tile editor (issue #122) — previously
// built once, inline, inside ScenarioTree only.

import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow, DialogSlide } from '@/types/dialog'

export type EntityUsage =
  | { type: 'trigger'; path: [number, number, number] }
  | { type: 'interruption'; path: [number] }
  /** [dialogId, slideId] — issue #167 Phase C's near-prerequisite fix: this
   *  table previously never scanned dialogs at all, so a delete-confirmation
   *  warning built on it would have silently missed any entity sid that only
   *  appears inside a dialog flow (dialogPlayConditions, answer requests, or
   *  any action/mapAction param — a slide/answer can reference an entity in
   *  any of those, confirmed against real dialog data). */
  | { type: 'dialog'; path: [string, string] }

/** Every entitySid referenced by a trigger's/interruption's action or
 *  condition params, or a dialog flow's condition/request/action params, by
 *  sid. `dialogs` is optional and defaults to none scanned — every existing
 *  call site should pass it now that this table exists, but callers that
 *  only care about the original scenario-side usage (if any remain) still
 *  compile without it. */
export function buildEntityUsageMap(
  scenario: ScenarioFile,
  dialogs: Record<string, DialogFlow> = {},
): Map<string, EntityUsage[]> {
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
  for (const [dialogId, flow] of Object.entries(dialogs)) {
    for (const slide of flow.slides) {
      const params = collectSlideParams(slide)
      for (const p of params) {
        if (typeof p === 'string' && p) register(p, { type: 'dialog', path: [dialogId, slide.id] })
      }
    }
  }
  return map
}

/** Every string param a slide (and its answers) could reference an entity
 *  sid through — conditions/requests' `p[]`, and every action/mapAction's
 *  own `p[]`. */
function collectSlideParams(slide: DialogSlide): string[] {
  const params: string[] = [
    ...(slide.dialogPlayConditions?.flatMap((c) => c.p ?? []) ?? []),
    ...(slide.actions?.flatMap((a) => a.p ?? []) ?? []),
    ...(slide.mapActions?.flatMap((a) => a.p ?? []) ?? []),
    ...(slide.closeMapActions?.flatMap((a) => a.p ?? []) ?? []),
  ]
  for (const answer of slide.answers ?? []) {
    params.push(
      ...(answer.requests?.flatMap((c) => c.p ?? []) ?? []),
      ...(answer.actions?.flatMap((a) => a.p ?? []) ?? []),
      ...(answer.mapActions?.flatMap((a) => a.p ?? []) ?? []),
    )
  }
  return params
}

/** "trigger [0, 1, 2]"-style label for the rename dialog's reference warning list. */
export function describeEntityUsage(u: EntityUsage): string {
  return `${u.type} [${u.path.join(', ')}]`
}
