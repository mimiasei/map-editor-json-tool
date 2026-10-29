// ─── Timeline / Event Overview ───────────────────────────────────────────────
// Flattens all quest triggers into categorized, sortable timeline entries.
// Interruptions are excluded — they are not part of the nested quest structure.

import type { ScenarioFile, Condition, Action, Trigger } from '@/types/scenario'
import { ACTION_REGISTRY } from '@/schema/actions'
import { CONDITION_REGISTRY } from '@/schema/conditions'
import i18n from '@/lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimelineCategory =
  | 'turn-based'
  | 'counter-gated'
  | 'reactive'
  | 'random-repeating'

export interface TimelineEntry {
  key: string
  category: TimelineCategory
  questSid: string
  subQuestSid: string
  triggerIndex: number
  path: [number, number, number]
  conditions: Condition[]
  conditionsLogic: 'And' | 'Or'
  actions: Action[]
  repeat: boolean
  /** Human-readable summary of the first condition only. */
  conditionSummary: string
  /** Human-readable summary of all actions (max 2 shown). */
  actionSummary: string
  /** Used for intra-category sorting. */
  sortKey: string | number
}

export const TIMELINE_CATEGORIES: TimelineCategory[] = ['turn-based', 'counter-gated', 'reactive', 'random-repeating']

// ─── Condition sets (for categorization) ─────────────────────────────────────

const TURN_CONDITIONS = new Set(['StartTurn', 'StartWeek', 'AnyStartTurn'])

const COUNTER_CONDITIONS = new Set([
  'Counter', 'ResCounter', 'ItemOwnSide', 'UnitOwnSide', 'UnitOwnHero',
])

const REACTIVE_CONDITIONS = new Set([
  'HeroKill', 'SquadKill', 'UnitKill', 'UnitLose', 'ObjectLose', 'PlayerDefeated',
  'SquadInteraction', 'ObjectInteractionBefore', 'ObjectInteractionAfter',
  'ObjectCaptureEntity', 'UnitHire', 'NodeRevealed', 'DifficultyCustomMap',
])

const RANDOM_ACTIONS = new Set(['CounterSetRandom', 'RandomDialog'])

// ─── Categorization (single-category, first-match wins) ──────────────────────

function categorize(trigger: Trigger): TimelineCategory {
  const conditions = trigger.conditions ?? []
  const actions = trigger.actions ?? []

  if (conditions.some((c) => TURN_CONDITIONS.has(c.c))) return 'turn-based'
  if (conditions.some((c) => COUNTER_CONDITIONS.has(c.c))) return 'counter-gated'
  if (conditions.some((c) => REACTIVE_CONDITIONS.has(c.c))) return 'reactive'
  if (trigger.repeat || actions.some((a) => RANDOM_ACTIONS.has(a.a))) return 'random-repeating'
  return 'random-repeating' // catch-all
}

function computeSortKey(
  trigger: Trigger,
  category: TimelineCategory,
  questSid: string,
): string | number {
  if (category === 'turn-based') {
    const startTurn = trigger.conditions.find((c) => c.c === 'StartTurn')
    if (startTurn?.p?.[0] !== undefined) {
      const n = Number(startTurn.p[0])
      return isNaN(n) ? Infinity : n
    }
    return Infinity
  }
  if (category === 'counter-gated') {
    const cc = trigger.conditions.find((c) => COUNTER_CONDITIONS.has(c.c))
    return cc?.p?.[0] ?? ''
  }
  if (category === 'reactive') {
    const rc = trigger.conditions.find((c) => REACTIVE_CONDITIONS.has(c.c))
    return rc?.c ?? ''
  }
  return questSid
}

// ─── Human-readable condition formatting ─────────────────────────────────────

function p(condition: Condition, idx: number): string {
  return condition.p?.[idx] ?? ''
}

export function formatCondition(condition: Condition): string {
  switch (condition.c) {
    case 'StartTurn': {
      if (p(condition, 0)) {
        const player = p(condition, 1) ? i18n.t('common.timelineDialog.cond.turnPlayer', { n: p(condition, 1) }) : ''
        const week = parseInt(p(condition, 0), 10)
        const day = parseInt(p(condition, 1), 10) || 0
        const turn = (week - 1) * 7 + day //week * 7 + day = turn
        return i18n.t('common.timelineDialog.cond.turn', { turn, week: p(condition, 0), day: p(condition, 1), player })
      }
      return i18n.t('common.timelineDialog.cond.anyTurn')
    }
    case 'StartWeek':    return i18n.t('common.timelineDialog.cond.weekStart')
    case 'AnyStartTurn': return i18n.t('common.timelineDialog.cond.anyTurn')

    case 'Counter':    return `${p(condition, 0)} ${p(condition, 1)} ${p(condition, 2)}`
    case 'ResCounter': return `${p(condition, 0)} ${p(condition, 1)} ${p(condition, 2)}`
    case 'ItemOwnSide':return i18n.t('common.timelineDialog.cond.item', { a: p(condition, 0), b: p(condition, 1), c: p(condition, 2) })
    case 'UnitOwnSide':return i18n.t('common.timelineDialog.cond.unit', { a: p(condition, 0), b: p(condition, 1), c: p(condition, 2) })
    case 'UnitOwnHero':return i18n.t('common.timelineDialog.cond.unitOnHero', { unit: p(condition, 1), hero: p(condition, 0), c: p(condition, 2), d: p(condition, 3) })

    case 'HeroKill':   return i18n.t('common.timelineDialog.cond.heroKilled', { v: p(condition, 0) })
    case 'SquadKill':  return i18n.t('common.timelineDialog.cond.squadDefeated', { v: p(condition, 0) })
    case 'UnitKill':   return i18n.t('common.timelineDialog.cond.unitKilled', { v: p(condition, 0) })
    case 'UnitLose':   return i18n.t('common.timelineDialog.cond.unitLost', { v: p(condition, 0) })
    case 'ObjectLose': return i18n.t('common.timelineDialog.cond.objectLost', { v: p(condition, 0) })
    case 'PlayerDefeated':          return i18n.t('common.timelineDialog.cond.playerDefeated', { n: p(condition, 0) })
    case 'SquadInteraction':        return i18n.t('common.timelineDialog.cond.interact', { v: p(condition, 0) })
    case 'ObjectInteractionBefore': return i18n.t('common.timelineDialog.cond.interactBefore', { v: p(condition, 0) })
    case 'ObjectInteractionAfter':  return i18n.t('common.timelineDialog.cond.interactAfter', { v: p(condition, 0) })
    case 'ObjectCaptureEntity':     return i18n.t('common.timelineDialog.cond.captured', { v: p(condition, 0) })
    case 'UnitHire':                return i18n.t('common.timelineDialog.cond.unitHired', { v: p(condition, 0) })
    case 'NodeRevealed':            return i18n.t('common.timelineDialog.cond.nodeRevealed', { v: p(condition, 0) })
    case 'DifficultyCustomMap':     return i18n.t('common.timelineDialog.cond.difficulty', { a: p(condition, 0), b: p(condition, 1) })

    default: {
      const def = CONDITION_REGISTRY[condition.c]
      return def ? def.label : condition.c
    }
  }
}

// ─── Human-readable action summary ───────────────────────────────────────────

export function formatActions(actions: Action[]): string {
  if (actions.length === 0) return '—'
  const labels = actions.map((a) => ACTION_REGISTRY[a.a]?.label ?? a.a)
  if (labels.length <= 2) return labels.join(' → ')
  return i18n.t('common.timelineDialog.cond.moreActions', { first: labels[0], second: labels[1], count: labels.length - 2 })
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildTimeline(scenario: ScenarioFile): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  scenario.quests.forEach((quest, qi) => {
    quest.subQuests.forEach((subQuest, sqi) => {
      subQuest.triggers.forEach((trigger, ti) => {
        const category = categorize(trigger)
        const sk = computeSortKey(trigger, category, quest.sid)
        const firstCondition = trigger.conditions[0]

        entries.push({
          key: `${qi}-${sqi}-${ti}`,
          category,
          questSid: quest.sid,
          subQuestSid: subQuest.sid,
          triggerIndex: ti,
          path: [qi, sqi, ti],
          conditions: trigger.conditions,
          conditionsLogic: trigger.conditionsLogic ?? 'And',
          actions: trigger.actions,
          repeat: trigger.repeat ?? false,
          conditionSummary: firstCondition ? formatCondition(firstCondition) : '—',
          actionSummary: formatActions(trigger.actions),
          sortKey: sk,
        })
      })
    })
  })

  return entries
}
