import type { ScenarioFile } from '@/types/scenario'

export interface ValidationMessage {
  path: string
  message: string
}

export interface ValidationResult {
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
}

export function validateScenario(scenario: ScenarioFile): ValidationResult {
  const errors: ValidationMessage[] = []
  const warnings: ValidationMessage[] = []

  const counterSids = new Set<string>()
  const questSids = new Map<string, Map<string, true>>() // questSid -> Set of subQuestSids

  // ── Counters ──────────────────────────────────────────────────────────────
  for (const [i, counter] of scenario.counters.entries()) {
    const path = `Counter[${i}]`
    if (!counter.sid) {
      errors.push({ path, message: 'SID is empty.' })
    } else if (counterSids.has(counter.sid)) {
      errors.push({ path, message: `Duplicate counter SID: "${counter.sid}".` })
    } else {
      counterSids.add(counter.sid)
    }
  }

  // ── Interruptions ─────────────────────────────────────────────────────────
  const interruptionSids = new Set<string>()
  for (const [i, interruption] of scenario.interruptions.entries()) {
    const path = `Interruption[${i}]`
    if (!interruption.sid) {
      errors.push({ path, message: 'SID is empty.' })
    } else if (interruptionSids.has(interruption.sid)) {
      errors.push({ path, message: `Duplicate interruption SID: "${interruption.sid}".` })
    } else {
      interruptionSids.add(interruption.sid)
    }
  }

  // ── Quests ────────────────────────────────────────────────────────────────
  const topQuestSids = new Set<string>()
  for (const [qi, quest] of scenario.quests.entries()) {
    const questPath = `Quest[${qi}] "${quest.sid}"`

    if (!quest.sid) {
      errors.push({ path: questPath, message: 'SID is empty.' })
    } else if (topQuestSids.has(quest.sid)) {
      errors.push({ path: questPath, message: `Duplicate quest SID: "${quest.sid}".` })
    } else {
      topQuestSids.add(quest.sid)
    }

    const subQuestSidMap = new Map<string, true>()
    questSids.set(quest.sid, subQuestSidMap)

    for (const [sqi, subQuest] of quest.subQuests.entries()) {
      const subPath = `${questPath} > SubQuest[${sqi}] "${subQuest.sid}"`

      if (!subQuest.sid) {
        errors.push({ path: subPath, message: 'SID is empty.' })
      } else if (subQuestSidMap.has(subQuest.sid)) {
        errors.push({ path: subPath, message: `Duplicate subquest SID: "${subQuest.sid}".` })
      } else {
        subQuestSidMap.set(subQuest.sid, true)
      }

      for (const [ti, trigger] of subQuest.triggers.entries()) {
        const trigPath = `${subPath} > Trigger[${ti}]`

        if (trigger.conditions.length === 0) {
          warnings.push({ path: trigPath, message: 'Trigger has no conditions.' })
        }
        if (trigger.actions.length === 0) {
          warnings.push({ path: trigPath, message: 'Trigger has no actions.' })
        }

        // Check action references
        for (const action of trigger.actions) {
          checkActionRefs(action, trigPath, counterSids, topQuestSids, questSids, warnings)
        }
      }
    }
  }

  // Also check interruption action refs
  for (const [i, interruption] of scenario.interruptions.entries()) {
    const path = `Interruption[${i}] "${interruption.sid}"`
    for (const action of interruption.actions) {
      checkActionRefs(action, path, counterSids, topQuestSids, questSids, warnings)
    }
  }

  return { errors, warnings }
}

function checkActionRefs(
  action: { a: string; p?: string[] },
  path: string,
  counterSids: Set<string>,
  questSids: Set<string>,
  questSubSids: Map<string, Map<string, true>>,
  warnings: ValidationMessage[],
): void {
  const p = action.p ?? []

  if (action.a === 'CounterPlus' || action.a === 'CounterSetRandom') {
    const sid = p[0]
    if (sid && !counterSids.has(sid)) {
      warnings.push({
        path,
        message: `${action.a}: counter "${sid}" is not defined in counters.`,
      })
    }
  }

  if (
    action.a === 'SubQuestActivate' ||
    action.a === 'SubQuestDeactivate' ||
    action.a === 'TriggerClearCustom' ||
    action.a === 'NextQuest' ||
    action.a === 'EndQuest'
  ) {
    const questSid = p[0]
    if (questSid && !questSids.has(questSid)) {
      warnings.push({
        path,
        message: `${action.a}: quest "${questSid}" is not defined in quests.`,
      })
    }

    if (
      (action.a === 'SubQuestActivate' || action.a === 'SubQuestDeactivate') &&
      p[1] !== undefined
    ) {
      const subSids = questSubSids.get(p[0])
      if (subSids && !subSids.has(p[1])) {
        warnings.push({
          path,
          message: `${action.a}: subquest "${p[1]}" not found in quest "${p[0]}".`,
        })
      }
    }
  }
}
