import type { Action, ScenarioFile } from '@/types/scenario'
import { ACTION_REGISTRY } from '@/schema/actions'

/** "fx_1" becomes "fx_2", "fx" becomes "fx_1". */
function nextName(name: string): string {
  const m = /^(.*)_(\d+)$/.exec(name)
  return m ? `${m[1]}_${Number(m[2]) + 1}` : `${name}_1`
}

/** Every entity name that the scenario's spawn and effect actions give to what they create. */
export function definedEntityNames(scenario: ScenarioFile): Set<string> {
  const names = new Set<string>()
  const scan = (actions: Action[] | undefined) => {
    for (const a of actions ?? []) {
      ACTION_REGISTRY[a.a]?.params.forEach((param, i) => {
        const v = a.p?.[i]
        if (param.defines && v) names.add(v)
      })
    }
  }
  for (const q of scenario.quests ?? []) {
    for (const sq of q.subQuests ?? []) for (const t of sq.triggers ?? []) scan(t.actions)
  }
  for (const it of scenario.interruptions ?? []) scan(it.actions)
  return names
}

/**
 * An identical copy of an action. The params that name a newly created thing (`defines` in the registry) get a
 * "_1"-style suffix so the copy does not reuse the original's entity name; `taken` is every name already in use
 * (map entities, other actions' names, the actions beside it).
 */
export function duplicateAction(action: Action, taken: Set<string>): Action {
  const params = ACTION_REGISTRY[action.a]?.params ?? []
  const p = (action.p ?? []).map((value, i) => {
    if (!params[i]?.defines || !value) return value
    let candidate = nextName(value)
    while (taken.has(candidate)) candidate = nextName(candidate)
    taken.add(candidate)
    return candidate
  })
  return { ...action, p }
}
