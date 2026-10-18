// ─── Game-ready scenario cleanup ──────────────────────────────────────────────
// The editor fills every parameter slot of a new condition/action with "", so a
// finished scenario carries trailing blanks (Dialog ["id", ""]) that no shipped
// map has — a wrong parameter count can silently kill a whole action list — and
// can carry a half-added condition with no values, which can never be true and
// so keeps its quest from ever firing. This runs on the way out (JSON export and
// the Block 4 embed); the scenario in the editor is left as the user typed it.

import type { Action, Condition, Interruption, Quest, ScenarioFile, Trigger } from '@/types/scenario'
import { ACTION_REGISTRY } from '@/schema/actions'
import { CONDITION_REGISTRY } from '@/schema/conditions'
import type { ParamDef } from '@/schema/conditions'

const isBlank = (v: string | undefined) => v === undefined || v === ''

/** Drops trailing blank values after the last required param. Unknown types are left alone. */
function trimParams(p: string[] | undefined, params: ParamDef[] | undefined): string[] | undefined {
  if (!p || !params) return p
  let end = p.length
  while (end > 0 && isBlank(p[end - 1]) && !params[end - 1]?.required && end - 1 < params.length) end--
  return end === p.length ? p : p.slice(0, end)
}

function cleanAction(action: Action): Action {
  const p = trimParams(action.p, ACTION_REGISTRY[action.a]?.params)
  return p === action.p ? action : { ...action, p }
}

function cleanCondition(condition: Condition): Condition {
  const p = trimParams(condition.p, CONDITION_REGISTRY[condition.c]?.params)
  return p === condition.p ? condition : { ...condition, p }
}

/** A known condition that needs values and has none filled in (a half-added condition). */
function isEmptyCondition(condition: Condition): boolean {
  const def = CONDITION_REGISTRY[condition.c]
  if (!def || !def.params.some((param) => param.required)) return false
  return (condition.p ?? []).every(isBlank)
}

function cleanTrigger(trigger: Trigger): Trigger {
  let conditions = trigger.conditions
  // Keep a lone empty condition: dropping it would leave a trigger with no conditions, which fires every tick.
  const real = conditions.filter((c) => !isEmptyCondition(c))
  if (real.length > 0) conditions = real
  return { ...trigger, conditions: conditions.map(cleanCondition), actions: trigger.actions.map(cleanAction) }
}

function cleanQuest(quest: Quest): Quest {
  return {
    ...quest,
    subQuests: quest.subQuests.map((sub) => ({ ...sub, triggers: sub.triggers.map(cleanTrigger) })),
  }
}

function cleanInterruption(interruption: Interruption): Interruption {
  return { ...interruption, actions: interruption.actions.map(cleanAction) }
}

/** The scenario as the game should receive it: no trailing blank optional params, no empty conditions. */
export function cleanScenarioForGame(scenario: ScenarioFile): ScenarioFile {
  return {
    ...scenario,
    interruptions: scenario.interruptions.map(cleanInterruption),
    quests: scenario.quests.map(cleanQuest),
  }
}
