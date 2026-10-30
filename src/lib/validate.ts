import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import { AVATAR_ANIMATIONS, RESULT_DIALOG_VALUES } from '@/types/dialog'
import { validateStoryState } from '@/lib/story-validate'
import i18n from '@/lib/i18n'

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
  /**
   * SIDs the base game already defines (from the catalog's speakerTitles). Speaker
   * labels are checked for missing text only when this is supplied, because a
   * built-in SID legitimately has no map-supplied token and warning on all 90 of
   * them would be pure noise.
   */
  knownGameSids?: Set<string>,
): ValidationResult {
  const errors: ValidationMessage[] = []
  const warnings: ValidationMessage[] = []
  const flowId = flow?.id || '(no id)'

  if (!flow || !Array.isArray(flow.slides)) {
    errors.push({ path: `Dialog "${flowId}"`, message: i18n.t('validate.scenario.slidesMustBeAnArray') })
    return { errors, warnings }
  }

  // ── Slide IDs ───────────────────────────────────────────────────────────────
  const slideIds = new Set<string>()
  for (const [si, slide] of flow.slides.entries()) {
    const path = `Dialog "${flowId}" > Slide[${si}] "${slide?.id ?? ''}"`
    if (!slide || typeof slide !== 'object') {
      errors.push({ path, message: i18n.t('validate.scenario.slideIsNotAnObject') })
      continue
    }
    if (!slide.id) {
      errors.push({ path, message: i18n.t('validate.scenario.slideIDIsEmpty') })
    } else if (slideIds.has(slide.id)) {
      errors.push({ path, message: i18n.t('validate.scenario.duplicateSlideID', { id: slide.id }) })
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
        message: i18n.t('validate.scenario.slideHasBothEndAnd', { next: slide.next }),
      })
    }
    if (slide.next && !slideIds.has(slide.next)) {
      errors.push({ path, message: i18n.t('validate.scenario.nextPointsAtUnknownSlide', { next: slide.next }) })
    }
    if (!slide.end && !slide.next && !hasAnswers) {
      warnings.push({
        path,
        message: i18n.t('validate.scenario.slideHasNoNextNo'),
      })
    }

    // Localization
    if (slide.text && !localization[slide.text]) {
      warnings.push({ path, message: i18n.t('validate.scenario.textSIDHasNoLocalization', { text: slide.text }) })
    }

    // Speaker label. A custom SID with no text renders as the raw SID in game.
    const titleSid = slide.title?.sid
    if (
      titleSid &&
      knownGameSids &&
      !knownGameSids.has(titleSid) &&
      !localization[titleSid]?.trim()
    ) {
      warnings.push({
        path,
        message: i18n.t('validate.scenario.speakerSIDHasNoLocalization', { titleSid }),
      })
    }

    // Avatars
    for (const [ai, avatar] of (slide.avatars ?? []).entries()) {
      const avPath = `${path} > Avatar[${ai}]`
      if (avatar.position < 1 || avatar.position > 5) {
        warnings.push({
          path: avPath,
          message: i18n.t('validate.scenario.positionIsOutsideThe1', { position: avatar.position }),
        })
      }
      if (avatar.isForeground !== 'true' && avatar.isForeground !== 'false') {
        warnings.push({
          path: avPath,
          message: i18n.t('validate.scenario.isForegroundShouldBeTheString', { value: JSON.stringify(avatar.isForeground) }),
        })
      }
      for (const anim of avatar.animations ?? []) {
        if (!(AVATAR_ANIMATIONS as readonly string[]).includes(anim)) {
          warnings.push({
            path: avPath,
            message: i18n.t('validate.scenario.unrecognisedAnimationKnown', { anim, known: AVATAR_ANIMATIONS.join(', ') }),
          })
        }
      }
    }

    // resultDialog
    if (slide.resultDialog && !(RESULT_DIALOG_VALUES as readonly string[]).includes(slide.resultDialog)) {
      warnings.push({
        path,
        message: i18n.t('validate.scenario.unrecognisedResultDialogValueKnown', { resultDialog: slide.resultDialog, known: RESULT_DIALOG_VALUES.join(', ') }),
      })
    }

    // Answers
    for (const [ai, answer] of (slide.answers ?? []).entries()) {
      const aPath = `${path} > Answer[${ai}]`
      if (answer.text && !localization[answer.text]) {
        warnings.push({
          path: aPath,
          message: i18n.t('validate.scenario.answerTextSIDHasNo', { text: answer.text }),
        })
      }
      const actions = Array.isArray(answer.actions) ? answer.actions : []
      if (actions.length === 0) {
        warnings.push({ path: aPath, message: i18n.t('validate.scenario.answerHasNoFlowActions') })
      }
      for (const action of actions) {
        if (action.a === 'End') hasTerminal = true
        if (action.a === 'Go') {
          const target = action.p?.[0]
          if (!target) {
            errors.push({ path: aPath, message: i18n.t('validate.scenario.goActionHasNoTarget') })
          } else if (!slideIds.has(target)) {
            errors.push({ path: aPath, message: i18n.t('validate.scenario.goPointsAtUnknownSlide', { target }) })
          }
        }
      }
    }
  }

  if (flow.slides.length > 0 && !hasTerminal) {
    errors.push({
      path: `Dialog "${flowId}"`,
      message: i18n.t('validate.scenario.noSlideEndsTheDialog'),
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
    /** Base-game SIDs, so built-in speaker labels aren't reported as missing. */
    knownGameSids?: Set<string>
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
      errors.push({ path, message: i18n.t('validate.scenario.sIDIsEmpty') })
    } else if (counterSids.has(counter.sid)) {
      errors.push({ path, message: i18n.t('validate.scenario.duplicateCounterSID', { sid: counter.sid }) })
    } else {
      counterSids.add(counter.sid)
    }
  }

  // ── Interruptions ─────────────────────────────────────────────────────────
  const interruptionSids = new Set<string>()
  for (const [i, interruption] of scenario.interruptions.entries()) {
    const path = `Interruption[${i}]`
    if (!interruption.sid) {
      errors.push({ path, message: i18n.t('validate.scenario.sIDIsEmpty') })
    } else if (interruptionSids.has(interruption.sid)) {
      errors.push({ path, message: i18n.t('validate.scenario.duplicateInterruptionSID', { sid: interruption.sid }) })
    } else {
      interruptionSids.add(interruption.sid)
    }
  }

  // ── Quests ────────────────────────────────────────────────────────────────
  const topQuestSids = new Set<string>()
  for (const [qi, quest] of scenario.quests.entries()) {
    const questPath = `Quest[${qi}] "${quest.sid}"`

    if (!quest.sid) {
      errors.push({ path: questPath, message: i18n.t('validate.scenario.sIDIsEmpty') })
    } else if (topQuestSids.has(quest.sid)) {
      errors.push({ path: questPath, message: i18n.t('validate.scenario.duplicateQuestSID', { sid: quest.sid }) })
    } else {
      topQuestSids.add(quest.sid)
    }

    const subQuestSidMap = new Map<string, true>()
    questSids.set(quest.sid, subQuestSidMap)

    for (const [sqi, subQuest] of quest.subQuests.entries()) {
      const subPath = `${questPath} > SubQuest[${sqi}] "${subQuest.sid}"`

      if (!subQuest.sid) {
        errors.push({ path: subPath, message: i18n.t('validate.scenario.sIDIsEmpty') })
      } else if (subQuestSidMap.has(subQuest.sid)) {
        errors.push({ path: subPath, message: i18n.t('validate.scenario.duplicateSubquestSID', { sid: subQuest.sid }) })
      } else {
        subQuestSidMap.set(subQuest.sid, true)
      }

      for (const [ti, trigger] of subQuest.triggers.entries()) {
        const trigPath = `${subPath} > Trigger[${ti}]`

        if (trigger.conditions.length === 0) {
          warnings.push({ path: trigPath, message: i18n.t('validate.scenario.triggerHasNoConditions') })
        }
        if (trigger.actions.length === 0) {
          warnings.push({ path: trigPath, message: i18n.t('validate.scenario.triggerHasNoActions') })
        }

      }
    }
  }

  // Action references are checked after every quest is registered, so a trigger
  // may point at a quest defined further down the list (e.g. NextQuest chains).
  for (const [qi, quest] of scenario.quests.entries()) {
    for (const [sqi, subQuest] of quest.subQuests.entries()) {
      for (const [ti, trigger] of subQuest.triggers.entries()) {
        const trigPath = `Quest[${qi}] "${quest.sid}" > SubQuest[${sqi}] "${subQuest.sid}" > Trigger[${ti}]`
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
    const { mapName = '', dialogs = {}, localization = {}, knownGameSids } = extras

    // mapName required if dialogs exist
    if (Object.keys(dialogs).length > 0 && !mapName.trim()) {
      warnings.push({
        path: 'Map Settings',
        message: i18n.t('validate.scenario.mapNameIsEmptyIt'),
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
                  message: i18n.t('validate.scenario.actionReferencesDialogKeyWhich', { a: action.a, key }),
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
              message: i18n.t('validate.scenario.actionReferencesDialogKeyWhich', { a: action.a, key }),
            })
          }
        }
      }
    }

    // Per-flow structural + localization checks (same code the inline JSON
    // editor runs, so both report identically)
    for (const flow of Object.values(dialogs)) {
      const flowResult = validateDialogFlow(flow, localization, knownGameSids)
      errors.push(...flowResult.errors)
      warnings.push(...flowResult.warnings)
    }

    // Check quest/subquest name SIDs have localization tokens
    for (const [qi, quest] of scenario.quests.entries()) {
      if (quest.name && !localization[quest.name]) {
        warnings.push({
          path: `Quest[${qi}] "${quest.sid}"`,
          message: i18n.t('validate.scenario.questNameSIDHasNo', { name: quest.name }),
        })
      }
      for (const [sqi, subQuest] of quest.subQuests.entries()) {
        if (subQuest.name && !localization[subQuest.name]) {
          warnings.push({
            path: `Quest[${qi}] > SubQuest[${sqi}] "${subQuest.sid}"`,
            message: i18n.t('validate.scenario.subQuestNameSIDHasNo', { name: subQuest.name }),
          })
        }
      }
    }
  }

  const storyResult = validateStoryState(scenario, {
    mapName: extras?.mapName,
    dialogs: extras?.dialogs,
  })
  errors.push(...storyResult.errors)
  warnings.push(...storyResult.warnings)

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
        message: i18n.t('validate.scenario.counterIsNotDefinedIn', { a: action.a, sid }),
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
        message: i18n.t('validate.scenario.questIsNotDefinedIn', { a: action.a, questSid }),
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
          message: i18n.t('validate.scenario.subquestNotFoundInQuest', { a: action.a, subquest: p[1], quest: p[0] }),
        })
      }
    }
  }
}
