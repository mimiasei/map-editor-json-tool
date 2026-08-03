import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import { AVATAR_ANIMATIONS, RESULT_DIALOG_VALUES } from '@/types/dialog'

export interface ValidationMessage {
  path: string
  message: string
}

export interface ValidationResult {
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
}

// ─── Dialog flow validation ─────────────────────────────────────────────────────

/**
 * Validate a single dialog flow. Errors mean the flow is structurally broken and
 * would misbehave in game — the inline JSON editor refuses to save them. Warnings
 * are advisory and never block.
 *
 * Called both per-flow from validateScenario() and directly by the JSON preview
 * column when the user hand-edits a dialog file.
 */
export function validateDialogFlow(
  flow: DialogFlow,
  localization: Record<string, string> = {},
): ValidationResult {
  const errors: ValidationMessage[] = []
  const warnings: ValidationMessage[] = []
  const flowId = flow?.id || '(no id)'

  if (!flow || !Array.isArray(flow.slides)) {
    errors.push({ path: `Dialog "${flowId}"`, message: '"slides" must be an array.' })
    return { errors, warnings }
  }

  // ── Slide IDs ───────────────────────────────────────────────────────────────
  const slideIds = new Set<string>()
  for (const [si, slide] of flow.slides.entries()) {
    const path = `Dialog "${flowId}" > Slide[${si}] "${slide?.id ?? ''}"`
    if (!slide || typeof slide !== 'object') {
      errors.push({ path, message: 'Slide is not an object.' })
      continue
    }
    if (!slide.id) {
      errors.push({ path, message: 'Slide ID is empty.' })
    } else if (slideIds.has(slide.id)) {
      errors.push({ path, message: `Duplicate slide ID: "${slide.id}".` })
    } else {
      slideIds.add(slide.id)
    }
  }

  // ── Per-slide checks ────────────────────────────────────────────────────────
  let hasTerminal = false

  for (const [si, slide] of flow.slides.entries()) {
    if (!slide || typeof slide !== 'object') continue
    const path = `Dialog "${flowId}" > Slide[${si}] "${slide.id}"`
    const hasAnswers = Array.isArray(slide.answers) && slide.answers.length > 0

    // Flow targets
    if (slide.end) hasTerminal = true
    if (slide.end && slide.next) {
      errors.push({
        path,
        message: `Slide has both "end" and "next" ("${slide.next}") — the game would ignore one. Pick one.`,
      })
    }
    if (slide.next && !slideIds.has(slide.next)) {
      errors.push({ path, message: `"next" points at unknown slide "${slide.next}".` })
    }
    if (!slide.end && !slide.next && !hasAnswers) {
      warnings.push({
        path,
        message: 'Slide has no "next", no "end", and no answers — the dialog stops here.',
      })
    }

    // Localization
    if (slide.text && !localization[slide.text]) {
      warnings.push({ path, message: `Text SID "${slide.text}" has no localization token.` })
    }

    // Avatars
    for (const [ai, avatar] of (slide.avatars ?? []).entries()) {
      const avPath = `${path} > Avatar[${ai}]`
      if (avatar.position < 1 || avatar.position > 5) {
        warnings.push({
          path: avPath,
          message: `Position ${avatar.position} is outside the 1–5 range the game renders.`,
        })
      }
      if (avatar.isForeground !== 'true' && avatar.isForeground !== 'false') {
        warnings.push({
          path: avPath,
          message: `"isForeground" should be the string "true" or "false", not ${JSON.stringify(avatar.isForeground)}.`,
        })
      }
      for (const anim of avatar.animations ?? []) {
        if (!(AVATAR_ANIMATIONS as readonly string[]).includes(anim)) {
          warnings.push({
            path: avPath,
            message: `Unrecognised animation "${anim}". Known: ${AVATAR_ANIMATIONS.join(', ')}.`,
          })
        }
      }
    }

    // resultDialog
    if (slide.resultDialog && !(RESULT_DIALOG_VALUES as readonly string[]).includes(slide.resultDialog)) {
      warnings.push({
        path,
        message: `Unrecognised "resultDialog" value "${slide.resultDialog}". Known: ${RESULT_DIALOG_VALUES.join(', ')}.`,
      })
    }

    // Answers
    for (const [ai, answer] of (slide.answers ?? []).entries()) {
      const aPath = `${path} > Answer[${ai}]`
      if (answer.text && !localization[answer.text]) {
        warnings.push({
          path: aPath,
          message: `Answer text SID "${answer.text}" has no localization token.`,
        })
      }
      const actions = Array.isArray(answer.actions) ? answer.actions : []
      if (actions.length === 0) {
        warnings.push({ path: aPath, message: 'Answer has no flow actions — it leads nowhere.' })
      }
      for (const action of actions) {
        if (action.a === 'End') hasTerminal = true
        if (action.a === 'Go') {
          const target = action.p?.[0]
          if (!target) {
            errors.push({ path: aPath, message: '"Go" action has no target slide ID.' })
          } else if (!slideIds.has(target)) {
            errors.push({ path: aPath, message: `"Go" points at unknown slide "${target}".` })
          }
        }
      }
    }
  }

  if (flow.slides.length > 0 && !hasTerminal) {
    errors.push({
      path: `Dialog "${flowId}"`,
      message: 'No slide ends the dialog — mark a slide as "end" or give an answer an "End" action.',
    })
  }

  return { errors, warnings }
}

export function validateScenario(
  scenario: ScenarioFile,
  extras?: {
    mapName?: string
    dialogs?: Record<string, DialogFlow>
    localization?: Record<string, string>
  },
): ValidationResult {
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

  // ── Dialog / localization checks ──────────────────────────────────────────
  if (extras) {
    const { mapName = '', dialogs = {}, localization = {} } = extras

    // mapName required if dialogs exist
    if (Object.keys(dialogs).length > 0 && !mapName.trim()) {
      warnings.push({
        path: 'Map Settings',
        message: 'Map name is empty. It is required to export a ZIP with dialog files.',
      })
    }

    // Check Dialog/RandomDialog action keys have corresponding flow
    for (const [qi, quest] of scenario.quests.entries()) {
      for (const [sqi, subQuest] of quest.subQuests.entries()) {
        for (const [ti, trigger] of subQuest.triggers.entries()) {
          const path = `Quest[${qi}] > SubQuest[${sqi}] > Trigger[${ti}]`
          for (const action of trigger.actions) {
            if ((action.a === 'Dialog' || action.a === 'RandomDialog') && action.p?.[0]) {
              const key = action.p[0]
              if (!dialogs[key]) {
                warnings.push({
                  path,
                  message: `Action "${action.a}" references dialog key "${key}" which has no dialog flow defined.`,
                })
              }
            }
          }
        }
      }
    }
    for (const [i, interruption] of scenario.interruptions.entries()) {
      const path = `Interruption[${i}] "${interruption.sid}"`
      for (const action of interruption.actions) {
        if ((action.a === 'Dialog' || action.a === 'RandomDialog') && action.p?.[0]) {
          const key = action.p[0]
          if (!dialogs[key]) {
            warnings.push({
              path,
              message: `Action "${action.a}" references dialog key "${key}" which has no dialog flow defined.`,
            })
          }
        }
      }
    }

    // Per-flow structural + localization checks (same code the inline JSON
    // editor runs, so both report identically)
    for (const flow of Object.values(dialogs)) {
      const flowResult = validateDialogFlow(flow, localization)
      errors.push(...flowResult.errors)
      warnings.push(...flowResult.warnings)
    }

    // Check quest/subquest name SIDs have localization tokens
    for (const [qi, quest] of scenario.quests.entries()) {
      if (quest.name && !localization[quest.name]) {
        warnings.push({
          path: `Quest[${qi}] "${quest.sid}"`,
          message: `Quest name SID "${quest.name}" has no localization token.`,
        })
      }
      for (const [sqi, subQuest] of quest.subQuests.entries()) {
        if (subQuest.name && !localization[subQuest.name]) {
          warnings.push({
            path: `Quest[${qi}] > SubQuest[${sqi}] "${subQuest.sid}"`,
            message: `SubQuest name SID "${subQuest.name}" has no localization token.`,
          })
        }
      }
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
