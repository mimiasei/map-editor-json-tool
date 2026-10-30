// ─── Visual Trigger Builder helpers ─────────────────────────────────────────
// Pure, presentation-only helpers for the "Card view" trigger builder
// (src/components/triggers/*). Never touches the store or the schema files —
// the UI-only condition category map below exists specifically so the "add
// condition" picker can group its 55 registry entries without adding a
// `category` field to ConditionDef (actions already have one; conditions
// don't, and this is a browsing aid, not a data-model concern).

import type { Condition, Action } from '@/types/scenario'
import { CONDITION_REGISTRY, type ParamDef } from '@/schema/conditions'
import { ACTION_REGISTRY } from '@/schema/actions'
import type { EntityCategory } from '@/schema/entities'
import type { GameCatalog } from '@/lib/catalog/types'
import type { PlacedObject } from '@/types/map-context'
import { STATIC_HEROES } from '@/lib/catalog/static-catalog'
import { resolveCastleFaction, getBuildingLevelNames } from '@/lib/building-options'
import { getVfxDisplayName } from '@/lib/vfx-options'
import {
  Hash,
  Clock,
  Coins,
  Crown,
  Users,
  MapPin,
  GraduationCap,
  ListChecks,
  Wrench,
  MessageSquare,
  AppWindow,
  Flag,
  Camera,
  Bot,
  HelpCircle,
  type AppIcon,
} from '@/components/ui/icons'
import i18n from '@/lib/i18n'
import { resourceName } from '@/lib/game-labels'
import { squadDifficultyName } from '@/lib/map-grid/squad-pool'
import { localName } from '@/lib/catalog/local-name'

// ─── UI-only condition categories ────────────────────────────────────────────
// A friendlier, consolidated regrouping of schema/conditions.ts's comment
// sections (which split into 10 buckets, several with just 1-3 entries) —
// fewer top-level groups is easier to scan when adding a condition. Every
// CONDITION_REGISTRY key still appears in exactly one bucket (55/55 covered),
// including the Tutorial bucket, which stays defined (for icon lookups on
// existing scenario data) even though the add-picker hides it by default.

export type UiCategoryId = 'progress' | 'time' | 'economy' | 'army' | 'heroMap' | 'tutorial'

export interface UiCategory {
  id: UiCategoryId
  icon: AppIcon
  types: string[]
}

export const CONDITION_UI_CATEGORIES: UiCategory[] = [
  {
    id: 'progress',
    icon: Hash,
    types: ['Counter', 'CompareCounters', 'CounterEqualityInDays', 'StoryCounter', 'QuestCompleted'],
  },
  {
    id: 'time',
    icon: Clock,
    types: [
      'StartTurn', 'AnyStartTurn', 'StartWeek', 'Difficulty', 'DifficultyCustomMap', 'NodeRevealed',
      'PlayerDefeated', 'CheckLoseIfHeroKilled', 'CheckLoseIfCityLost',
    ],
  },
  {
    id: 'economy',
    icon: Coins,
    types: ['ResCounter', 'BuildingConstruct', 'BuildingOwn'],
  },
  {
    id: 'army',
    icon: Crown,
    types: [
      'SpellCast', 'ItemOwnSide', 'ItemDestroyed', 'UnitOwnSide', 'UnitHire', 'UnitLose', 'UnitKill',
      'ItemOwnHero', 'UnitOwnHero', 'HeroStat',
    ],
  },
  {
    id: 'heroMap',
    icon: MapPin,
    types: [
      'HeroKill', 'ObjectInteractionBefore', 'ObjectInteractionAfter', 'ObjectCaptureEntity',
      'ObjectCaptureSid', 'MultipleObjectOwn', 'ObjectLose', 'SquadInteraction', 'SquadKill',
    ],
  },
  {
    id: 'tutorial',
    icon: GraduationCap,
    types: [
      'TutorialMovePoints', 'TutorialOpenCity', 'TutorialShowTooltipSquad', 'TutorialShowTooltipWO',
      'TutorialResChange', 'TutorialLevelUp', 'TutorialHeroUI', 'TutorialMagicGuild',
      'TutorialOpenFractionLaws', 'TutorialLevelUppedFractionLaws', 'TutorialOpenMagicBookMap',
      'TutorialHeroInteractWithAllyHero', 'TutorialStartBattleForMap', 'TutorialStartBattleForCity',
      'TutorialStartBattleForWorldObject', 'TutorialStartTurnUnit', 'TutorialOpenMagicBookBattle',
      'TutorialBattleEnergy', 'TutorialUnitUI',
    ],
  },
]

// ─── Unfrozen campaign/tutorial-only types ───────────────────────────────────
// These are real, fully-supported registry entries (existing scenario data
// using them still renders/edits normally via ConditionForm/ActionForm and
// still gets a category icon above) — they're just hidden from the "add
// condition/action" picker's default list, since they only apply to
// Unfrozen's own official campaign missions, not to custom maps made in TSE.
// StoryCounter/Difficulty/Guide/StoryCounter*/EnableAiResurrect/
// DisableAiResurrect are explicitly documented as campaign-only; the 19
// Tutorial* conditions are onboarding checks for the official campaign's
// tutorial mission.

export const HIDDEN_CONDITION_TYPES = new Set<string>([
  'StoryCounter',
  'Difficulty',
  'TutorialMovePoints', 'TutorialOpenCity', 'TutorialShowTooltipSquad', 'TutorialShowTooltipWO',
  'TutorialResChange', 'TutorialLevelUp', 'TutorialHeroUI', 'TutorialMagicGuild',
  'TutorialOpenFractionLaws', 'TutorialLevelUppedFractionLaws', 'TutorialOpenMagicBookMap',
  'TutorialHeroInteractWithAllyHero', 'TutorialStartBattleForMap', 'TutorialStartBattleForCity',
  'TutorialStartBattleForWorldObject', 'TutorialStartTurnUnit', 'TutorialOpenMagicBookBattle',
  'TutorialBattleEnergy', 'TutorialUnitUI',
])

export const HIDDEN_ACTION_TYPES = new Set<string>([
  'Guide',
  'StoryCounterPlus', 'StoryCounterMinus', 'StoryCounterSet',
  'EnableAiResurrect', 'DisableAiResurrect',
  'ChangeCampaignOneStep',
])

const CONDITION_CATEGORY_BY_TYPE = new Map<string, UiCategory>()
for (const category of CONDITION_UI_CATEGORIES) {
  for (const type of category.types) CONDITION_CATEGORY_BY_TYPE.set(type, category)
}

export function getConditionCategory(type: string): UiCategory | undefined {
  return CONDITION_CATEGORY_BY_TYPE.get(type)
}

// ─── Action category icons ───────────────────────────────────────────────────
// One icon per existing ACTION_CATEGORIES value (schema/actions.ts already
// has real categories — this just attaches a soft visual language to them).

export const ACTION_CATEGORY_ICONS: Record<string, AppIcon> = {
  'Quest Management': ListChecks,
  'Technical': Wrench,
  'Counter': Hash,
  'Dialogs': MessageSquare,
  'UI': AppWindow,
  'Game Rules': Flag,
  'Camera': Camera,
  'Economy': Coins,
  'Map Objects': MapPin,
  'Squads': Users,
  'Heroes': Crown,
  'AI': Bot,
}

export function getActionCategoryIcon(category: string): AppIcon {
  return ACTION_CATEGORY_ICONS[category] ?? HelpCircle
}

// ─── "Recently used" tracking for the add-condition/add-action picker ───────
// A convenience shortcut, not required state — silently no-ops if
// localStorage is unavailable (private browsing, etc.).

const RECENT_TYPES_KEY: Record<'condition' | 'action', string> = {
  condition: 'tse.recentConditionTypes',
  action: 'tse.recentActionTypes',
}

export function getRecentTypes(kind: 'condition' | 'action'): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TYPES_KEY[kind])
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function recordRecentType(kind: 'condition' | 'action', type: string): void {
  if (!type) return
  try {
    const next = [type, ...getRecentTypes(kind).filter((t) => t !== type)].slice(0, 5)
    localStorage.setItem(RECENT_TYPES_KEY[kind], JSON.stringify(next))
  } catch {
    // recents are a convenience, not required for the feature to function
  }
}

// ─── Configured / needs-setup detection ──────────────────────────────────────

export function isConditionConfigured(condition: Condition): boolean {
  if (!condition.c) return false
  const def = CONDITION_REGISTRY[condition.c]
  if (!def) return true // custom/unknown type — nothing to validate against
  return def.params.every((param, i) => !param.required || !!(condition.p ?? [])[i]?.trim())
}

export function isActionConfigured(action: Action): boolean {
  if (!action.a) return false
  const def = ACTION_REGISTRY[action.a]
  if (!def) return true
  return def.params.every((param, i) => !param.required || !!(action.p ?? [])[i]?.trim())
}

// ─── Plain-language sentence formatting ──────────────────────────────────────
// One card, one glance — friendlier and more verbose than timeline.ts's
// formatCondition/formatActions, which are tuned for a dense multi-row list
// elsewhere. Falls back to "label — value, value" (never blank) for any type
// without a hand-written template yet.

function val(item: Condition | Action, i: number): string {
  return (item.p ?? [])[i]?.trim() ?? ''
}

function q(v: string): string {
  return v ? `"${v}"` : ''
}

function opWord(sym: string): string {
  const key = `triggers.sentence.ops.${sym}`
  return i18n.exists(key) ? i18n.t(key as 'triggers.sentence.ops.=') : sym
}

const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Difficult', 'Impossible', 'Lethal']

function difficultyName(index: string): string {
  const n = Number(index)
  return DIFFICULTY_NAMES[n] ? squadDifficultyName(DIFFICULTY_NAMES[n]) : index
}

function fallbackSentence(label: string, params: ParamDef[], values: string[]): string {
  const parts = params
    .map((_param, i) => values[i]?.trim())
    .filter((v): v is string => !!v)
  if (parts.length === 0) return label
  return `${label} — ${parts.join(', ')}`
}

/** Optional game-data context for resolving a "Building SID" param into its
 *  real name (e.g. "Hippodrome II") instead of the raw sid + "(level N)" —
 *  omitted entirely when the caller has no catalog/map context on hand
 *  (falls back to the old raw-sid text). */
export interface SentenceCtx {
  catalog?: GameCatalog | null
  placedObjects?: PlacedObject[]
}

function buildingLabel(sid: string, level: string, castleEntitySid: string, ctx?: SentenceCtx): string {
  if (!sid) return q(sid)
  const faction = resolveCastleFaction(ctx?.placedObjects, castleEntitySid)
  const names = getBuildingLevelNames(ctx?.catalog ?? null, sid, faction)
  const name = names[Number(level) - 1]
  return name ? q(name) : `${q(sid)}${level ? i18n.t('triggers.sentence.buildingLevel', { n: level }) : ''}`
}

export function formatConditionSentence(condition: Condition, ctx?: SentenceCtx): string {
  const p = (i: number) => val(condition, i)
  switch (condition.c) {
    case 'Counter':
      return i18n.t('triggers.sentence.condition.Counter', { q0: q(p(0)), op1: opWord(p(1)), p2: p(2) })
    case 'CompareCounters':
      return i18n.t('triggers.sentence.condition.CompareCounters', { q0: q(p(0)), op1: opWord(p(1)), q2: q(p(2)) })
    case 'CounterEqualityInDays':
      return i18n.t('triggers.sentence.condition.CounterEqualityInDays', { q0: q(p(0)), p1: p(1) })
    case 'StoryCounter':
      return i18n.t('triggers.sentence.condition.StoryCounter', { q0: q(p(0)), op1: opWord(p(1)), p2: p(2) })
    case 'QuestCompleted':
      return i18n.t('triggers.sentence.condition.QuestCompleted', { q0: q(p(0)) })
    case 'Difficulty':
      return i18n.t('triggers.sentence.condition.Difficulty', { diff0: difficultyName(p(0)) })
    case 'DifficultyCustomMap':
      return i18n.t('triggers.sentence.condition.DifficultyCustomMap', { p0: p(0), diff1: difficultyName(p(1)) })
    case 'StartWeek':
      return i18n.t('triggers.sentence.condition.StartWeek')
    case 'NodeRevealed':
      return i18n.t('triggers.sentence.condition.NodeRevealed', { p0: p(0) })
    case 'PlayerDefeated':
      return i18n.t('triggers.sentence.condition.PlayerDefeated', { p0: p(0) })
    case 'CheckLoseIfHeroKilled':
      return i18n.t('triggers.sentence.condition.CheckLoseIfHeroKilled', { p0: p(0) })
    case 'CheckLoseIfCityLost':
      return i18n.t('triggers.sentence.condition.CheckLoseIfCityLost', { p0: p(0) })
    case 'ResCounter':
      return i18n.t('triggers.sentence.condition.ResCounter', { op1: opWord(p(1)), p2: p(2), res0: resourceName(p(0)) })
    case 'BuildingConstruct':
      return p(2) ? i18n.t('triggers.sentence.condition.BuildingConstruct_In', { bld: buildingLabel(p(0), p(1), p(2), ctx), q2: q(p(2)) }) : i18n.t('triggers.sentence.condition.BuildingConstruct', { bld: buildingLabel(p(0), p(1), p(2), ctx) })
    case 'BuildingOwn':
      return p(2) ? i18n.t('triggers.sentence.condition.BuildingOwn_In', { bld: buildingLabel(p(0), p(1), p(2), ctx), q2: q(p(2)) }) : i18n.t('triggers.sentence.condition.BuildingOwn', { bld: buildingLabel(p(0), p(1), p(2), ctx) })
    case 'SpellCast':
      return i18n.t('triggers.sentence.condition.SpellCast', { q0: q(p(0)) })
    case 'ItemOwnSide':
      return p(0) ? i18n.t('triggers.sentence.condition.ItemOwnSide_Item', { op1: opWord(p(1)), p2: p(2), q0: q(p(0)) }) : i18n.t('triggers.sentence.condition.ItemOwnSide_Any', { op1: opWord(p(1)), p2: p(2) })
    case 'ItemDestroyed':
      return i18n.t('triggers.sentence.condition.ItemDestroyed', { q0: q(p(0)) })
    case 'UnitOwnSide':
      return i18n.t('triggers.sentence.condition.UnitOwnSide', { op1: opWord(p(1)), p2: p(2), q0: q(p(0)) })
    case 'UnitHire':
      return i18n.t('triggers.sentence.condition.UnitHire', { q0: q(p(0)) })
    case 'UnitLose':
      return i18n.t('triggers.sentence.condition.UnitLose', { q0: q(p(0)) })
    case 'UnitKill':
      return i18n.t('triggers.sentence.condition.UnitKill', { q0: q(p(0)) })
    case 'HeroKill':
      return i18n.t('triggers.sentence.condition.HeroKill', { q0: q(p(0)) })
    case 'ItemOwnHero':
      return p(0) ? i18n.t('triggers.sentence.condition.ItemOwnHero_Item', { q1: q(p(1)), q0: q(p(0)) }) : i18n.t('triggers.sentence.condition.ItemOwnHero_Any', { q1: q(p(1)) })
    case 'UnitOwnHero':
      return i18n.t('triggers.sentence.condition.UnitOwnHero', { q0: q(p(0)), q1: q(p(1)), op2: opWord(p(2)), p3: p(3) })
    case 'HeroStat':
      return p(0) ? i18n.t('triggers.sentence.condition.HeroStat_Hero', { q0: q(p(0)), p1: p(1), op2: opWord(p(2)), p3: p(3) }) : i18n.t('triggers.sentence.condition.HeroStat_Selected', { p1: p(1), op2: opWord(p(2)), p3: p(3) })
    case 'ObjectInteractionBefore':
      return p(1) ? i18n.t('triggers.sentence.condition.ObjectInteractionBefore_Hero', { q1: q(p(1)), q0: q(p(0)) }) : i18n.t('triggers.sentence.condition.ObjectInteractionBefore_Any', { q0: q(p(0)) })
    case 'ObjectInteractionAfter':
      return p(1) ? i18n.t('triggers.sentence.condition.ObjectInteractionAfter_Hero', { q1: q(p(1)), q0: q(p(0)) }) : i18n.t('triggers.sentence.condition.ObjectInteractionAfter_Any', { q0: q(p(0)) })
    case 'ObjectCaptureEntity':
      return i18n.t('triggers.sentence.condition.ObjectCaptureEntity', { q0: q(p(0)) })
    case 'ObjectCaptureSid':
      return i18n.t('triggers.sentence.condition.ObjectCaptureSid', { q0: q(p(0)) })
    case 'MultipleObjectOwn':
      return i18n.t('triggers.sentence.condition.MultipleObjectOwn', { op1: opWord(p(1)), p2: p(2), q0: q(p(0)) })
    case 'ObjectLose':
      return i18n.t('triggers.sentence.condition.ObjectLose', { q0: q(p(0)) })
    case 'SquadInteraction':
      return p(1) ? i18n.t('triggers.sentence.condition.SquadInteraction_Hero', { q1: q(p(1)), q0: q(p(0)) }) : i18n.t('triggers.sentence.condition.SquadInteraction_Any', { q0: q(p(0)) })
    case 'SquadKill':
      return i18n.t('triggers.sentence.condition.SquadKill', { q0: q(p(0)) })
    case 'TutorialMovePoints':
      return i18n.t('triggers.sentence.condition.TutorialMovePoints', { op1: opWord(p(1)), p0: p(0) })
    case 'TutorialOpenCity':
      return i18n.t('triggers.sentence.condition.TutorialOpenCity')
    case 'TutorialShowTooltipSquad':
      return i18n.t('triggers.sentence.condition.TutorialShowTooltipSquad')
    case 'TutorialShowTooltipWO':
      return i18n.t('triggers.sentence.condition.TutorialShowTooltipWO')
    case 'TutorialResChange':
      return i18n.t('triggers.sentence.condition.TutorialResChange', { res0: resourceName(p(0)) })
    case 'TutorialLevelUp':
      return i18n.t('triggers.sentence.condition.TutorialLevelUp')
    case 'TutorialHeroUI':
      return i18n.t('triggers.sentence.condition.TutorialHeroUI')
    case 'TutorialMagicGuild':
      return i18n.t('triggers.sentence.condition.TutorialMagicGuild')
    case 'TutorialOpenFractionLaws':
      return i18n.t('triggers.sentence.condition.TutorialOpenFractionLaws')
    case 'TutorialLevelUppedFractionLaws':
      return i18n.t('triggers.sentence.condition.TutorialLevelUppedFractionLaws')
    case 'TutorialOpenMagicBookMap':
      return i18n.t('triggers.sentence.condition.TutorialOpenMagicBookMap')
    case 'TutorialHeroInteractWithAllyHero':
      return i18n.t('triggers.sentence.condition.TutorialHeroInteractWithAllyHero')
    case 'TutorialStartBattleForMap':
      return i18n.t('triggers.sentence.condition.TutorialStartBattleForMap')
    case 'TutorialStartBattleForCity':
      return i18n.t('triggers.sentence.condition.TutorialStartBattleForCity')
    case 'TutorialStartBattleForWorldObject':
      return i18n.t('triggers.sentence.condition.TutorialStartBattleForWorldObject')
    case 'TutorialStartTurnUnit':
      return i18n.t('triggers.sentence.condition.TutorialStartTurnUnit')
    case 'TutorialOpenMagicBookBattle':
      return i18n.t('triggers.sentence.condition.TutorialOpenMagicBookBattle')
    case 'TutorialBattleEnergy':
      return i18n.t('triggers.sentence.condition.TutorialBattleEnergy')
    case 'TutorialUnitUI':
      return i18n.t('triggers.sentence.condition.TutorialUnitUI')
    case 'StartTurn': {
      const week = p(0)
      const day = p(1)
      if (!week && !day) return i18n.t('triggers.sentence.condition.StartTurnAny')
      const parts = [week && i18n.t('triggers.sentence.parts.week', { n: week }), day && i18n.t('triggers.sentence.parts.day', { n: day })].filter(Boolean)
      return i18n.t('triggers.sentence.condition.StartTurn', { parts: parts.join(', ') })
    }
    case 'AnyStartTurn': {
      const [month, week, day] = [p(0), p(1), p(2)]
      const parts = [
        month && month !== '-1' && i18n.t('triggers.sentence.parts.month', { n: month }),
        week && week !== '-1' && i18n.t('triggers.sentence.parts.week', { n: week }),
        day && day !== '-1' && i18n.t('triggers.sentence.parts.day', { n: day }),
      ].filter(Boolean)
      return parts.length ? i18n.t('triggers.sentence.condition.StartTurn', { parts: parts.join(', ') }) : i18n.t('triggers.sentence.condition.AnyStartTurnNearest')
    }
    default: {
      const def = CONDITION_REGISTRY[condition.c]
      return def ? fallbackSentence(def.label, def.params, condition.p ?? []) : (condition.c || i18n.t('triggers.sentence.chooseCondition'))
    }
  }
}

export function formatActionSentence(action: Action, ctx?: SentenceCtx): string {
  const p = (i: number) => val(action, i)
  switch (action.a) {
    case 'NextQuest':
      return p(0) ? i18n.t('triggers.sentence.action.NextQuest_Start', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.NextQuest_End')
    case 'EndQuest':
      return i18n.t('triggers.sentence.action.EndQuest', { list: [p(0), p(1), p(2)].filter(Boolean).map(q).join(', ') })
    case 'NextSubQuest':
      return i18n.t('triggers.sentence.action.NextSubQuest', { list: [p(0), p(1), p(2)].filter(Boolean).map(q).join(', ') })
    case 'SubQuestActivate':
      return i18n.t('triggers.sentence.action.SubQuestActivate', { q1: q(p(1)), q0: q(p(0)) })
    case 'SubQuestDeactivate':
      return i18n.t('triggers.sentence.action.SubQuestDeactivate', { q1: q(p(1)), q0: q(p(0)) })
    case 'CurrentSubQuestDone':
      return i18n.t('triggers.sentence.action.CurrentSubQuestDone')
    case 'SubQuestDone':
      return i18n.t('triggers.sentence.action.SubQuestDone', { q1: q(p(1)) })
    case 'NextAfterGroup':
      return i18n.t('triggers.sentence.action.NextAfterGroup', { q0: q(p(0)), q1: q(p(1)) })
    case 'NextQuestAfterGroup':
      return i18n.t('triggers.sentence.action.NextQuestAfterGroup', { q0: q(p(0)), q1: q(p(1)) })
    case 'NextSubGroupAfterGroup':
      return i18n.t('triggers.sentence.action.NextSubGroupAfterGroup', { q0: q(p(0)), q1: q(p(1)) })
    case 'TriggerClear':
      return i18n.t('triggers.sentence.action.TriggerClear', { p2: p(2), q1: q(p(1)) })
    case 'TriggerClearCustom':
      return i18n.t('triggers.sentence.action.TriggerClearCustom', { p3: p(3), p2: p(2), q1: q(p(1)) })
    case 'AutoSave':
      return i18n.t('triggers.sentence.action.AutoSave')
    case 'Print':
      return i18n.t('triggers.sentence.action.Print', { q0: q(p(0)) })
    case 'EnableInterruption':
      return i18n.t('triggers.sentence.action.EnableInterruption', { q0: q(p(0)) })
    case 'DisableInterruption':
      return i18n.t('triggers.sentence.action.DisableInterruption', { q0: q(p(0)) })
    case 'BreakInterruptions':
      return i18n.t('triggers.sentence.action.BreakInterruptions')
    case 'CounterPlus':
      return i18n.t('triggers.sentence.action.CounterPlus', { q0: q(p(0)), p1: p(1) })
    case 'CounterMinus':
      return i18n.t('triggers.sentence.action.CounterMinus', { q0: q(p(0)), p1: p(1) })
    case 'CounterSet':
      return i18n.t('triggers.sentence.action.CounterSet', { q0: q(p(0)), p1: p(1) })
    case 'CounterSetRandom':
      return i18n.t('triggers.sentence.action.CounterSetRandom', { q0: q(p(0)), p1: p(1), p2: p(2) })
    case 'StoryCounterPlus':
      return i18n.t('triggers.sentence.action.StoryCounterPlus', { q0: q(p(0)), p1: p(1) })
    case 'StoryCounterMinus':
      return i18n.t('triggers.sentence.action.StoryCounterMinus', { q0: q(p(0)), p1: p(1) })
    case 'StoryCounterSet':
      return i18n.t('triggers.sentence.action.StoryCounterSet', { q0: q(p(0)), p1: p(1) })
    case 'Dialog':
      return i18n.t('triggers.sentence.action.Dialog', { q0: q(p(0)) })
    case 'DialogIfHero':
      return i18n.t('triggers.sentence.action.DialogIfHero', { q1: q(p(1)), q0: q(p(0)) })
    case 'DialogIfRes':
      return i18n.t('triggers.sentence.action.DialogIfRes', { op2: opWord(p(2)), p3: p(3), res1: resourceName(p(1)), q0: q(p(0)) })
    case 'DialogIfCounter':
      return i18n.t('triggers.sentence.action.DialogIfCounter', { q1: q(p(1)), op2: opWord(p(2)), p3: p(3), q0: q(p(0)) })
    case 'DialogIfItem':
      return i18n.t('triggers.sentence.action.DialogIfItem', { q1: q(p(1)), q0: q(p(0)) })
    case 'RandomDialog':
      return i18n.t('triggers.sentence.action.RandomDialog', { list: [p(0), p(1), p(2), p(3), p(4)].filter(Boolean).map(q).join(', ') })
    case 'DialogOne':
      return i18n.t('triggers.sentence.action.DialogOne', { q0: q(p(0)) })
    case 'DialogOneIfHero':
      return i18n.t('triggers.sentence.action.DialogOneIfHero', { q1: q(p(1)), q0: q(p(0)) })
    case 'DialogOneIfRes':
      return i18n.t('triggers.sentence.action.DialogOneIfRes', { op2: opWord(p(2)), p3: p(3), res1: resourceName(p(1)), q0: q(p(0)) })
    case 'DialogOneIfCounter':
      return i18n.t('triggers.sentence.action.DialogOneIfCounter', { q1: q(p(1)), op2: opWord(p(2)), p3: p(3), q0: q(p(0)) })
    case 'ShowFloatingUI':
      return i18n.t('triggers.sentence.action.ShowFloatingUI', { q1: q(p(1)) })
    case 'OpenUI':
      return i18n.t('triggers.sentence.action.OpenUI', { p0: p(0) })
    case 'Guide':
      return i18n.t('triggers.sentence.action.Guide', { q0: q(p(0)) })
    case 'GameVictory':
      return i18n.t('triggers.sentence.action.GameVictory')
    case 'GameLose':
      return i18n.t('triggers.sentence.action.GameLose')
    case 'SideLose':
      return i18n.t('triggers.sentence.action.SideLose', { p0: p(0) })
    case 'ChangeCampaignOneStep':
      return p(0) === 'true' ? i18n.t('triggers.sentence.action.ChangeCampaignOneStep_On') : i18n.t('triggers.sentence.action.ChangeCampaignOneStep_Off')
    case 'AddGlobalBuff':
      return i18n.t('triggers.sentence.action.AddGlobalBuff', { q0: q(p(0)) })
    case 'RemoveGlobalBuff':
      return i18n.t('triggers.sentence.action.RemoveGlobalBuff', { q0: q(p(0)) })
    case 'MoveCamera':
      return i18n.t('triggers.sentence.action.MoveCamera', { p0: p(0) })
    case 'MoveCameraToSelectHero':
      return i18n.t('triggers.sentence.action.MoveCameraToSelectHero')
    case 'RevealFogOfWar':
      return i18n.t('triggers.sentence.action.RevealFogOfWar', { p0: p(0) })
    case 'CreateFogOfWar':
      return i18n.t('triggers.sentence.action.CreateFogOfWar', { p0: p(0) })
    case 'GiveRes':
      return i18n.t('triggers.sentence.action.GiveRes', { p1: p(1), res0: resourceName(p(0)) })
    case 'RemoveRes':
      return i18n.t('triggers.sentence.action.RemoveRes', { p1: p(1), res0: resourceName(p(0)) })
    case 'UnlockSpell':
      return i18n.t('triggers.sentence.action.UnlockSpell', { q0: q(p(0)) })
    case 'UnlockBuildingCity':
      return i18n.t('triggers.sentence.action.UnlockBuildingCity', { bld: buildingLabel(p(0), p(1), p(2), ctx), q2: q(p(2)) })
    case 'CreateBuildingCity':
      return i18n.t('triggers.sentence.action.CreateBuildingCity', { bld: buildingLabel(p(0), p(1), p(2), ctx), q2: q(p(2)) })
    case 'CaptureObject':
      return i18n.t('triggers.sentence.action.CaptureObject', { q0: q(p(0)) })
    case 'LoseObject':
      return i18n.t('triggers.sentence.action.LoseObject', { q0: q(p(0)) })
    case 'SpawnObject':
      return i18n.t('triggers.sentence.action.SpawnObject', { q0: q(p(0)), p1: p(1) })
    case 'SpawnMapObject':
      return i18n.t('triggers.sentence.action.SpawnMapObject', { q0: q(p(0)), p1: p(1) })
    case 'CreateVFX':
      return i18n.t('triggers.sentence.action.CreateVFX', { vfx: getVfxDisplayName(ctx?.catalog, p(0)), p1: p(1) })
    case 'EventBankRefresh':
      return i18n.t('triggers.sentence.action.EventBankRefresh', { q0: q(p(0)) })
    case 'SetActiveVFX':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetActiveVFX_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetActiveVFX_Off', { q0: q(p(0)) })
    case 'SetQuestMarker':
      return i18n.t('triggers.sentence.action.SetQuestMarker', { q0: q(p(0)) })
    case 'SetActiveQuestMarker':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetActiveQuestMarker_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetActiveQuestMarker_Off', { q0: q(p(0)) })
    case 'SetActivePortal':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetActivePortal_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetActivePortal_Off', { q0: q(p(0)) })
    case 'SetActiveMarker':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetActiveMarker_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetActiveMarker_Off', { q0: q(p(0)) })
    case 'DeleteEntity':
      return i18n.t('triggers.sentence.action.DeleteEntity', { q0: q(p(0)) })
    case 'DeleteMarkerByNode':
      return i18n.t('triggers.sentence.action.DeleteMarkerByNode', { p0: p(0) })
    case 'EntityActionsOff':
      return i18n.t('triggers.sentence.action.EntityActionsOff', { q0: q(p(0)) })
    case 'SpawnSquad':
      return i18n.t('triggers.sentence.action.SpawnSquad', { q0: q(p(0)), p1: p(1) })
    case 'SpawnSquadNPC':
      return i18n.t('triggers.sentence.action.SpawnSquadNPC', { q0: q(p(0)), p1: p(1) })
    case 'SetFlagEscape':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetFlagEscape_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetFlagEscape_Off', { q0: q(p(0)) })
    case 'SetFlagAutobattle':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.SetFlagAutobattle_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.SetFlagAutobattle_Off', { q0: q(p(0)) })
    case 'ChangeCampaignDiplomacy':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.ChangeCampaignDiplomacy_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.ChangeCampaignDiplomacy_Off', { q0: q(p(0)) })
    case 'ChangeAlwaysDiplomacy':
      return p(1) === 'true' ? i18n.t('triggers.sentence.action.ChangeAlwaysDiplomacy_On', { q0: q(p(0)) }) : i18n.t('triggers.sentence.action.ChangeAlwaysDiplomacy_Off', { q0: q(p(0)) })
    case 'ChangeSquadReactionType':
      return i18n.t('triggers.sentence.action.ChangeSquadReactionType', { q0: q(p(0)), p1: p(1) })
    case 'IncreaseStrengthSquad':
      return i18n.t('triggers.sentence.action.IncreaseStrengthSquad', { q0: q(p(0)), p1: p(1) })
    case 'ReduceStrengthSquad':
      return i18n.t('triggers.sentence.action.ReduceStrengthSquad', { q0: q(p(0)), p1: p(1) })
    case 'DeleteSquad':
      return i18n.t('triggers.sentence.action.DeleteSquad', { q0: q(p(0)) })
    case 'SpawnHero':
      return i18n.t('triggers.sentence.action.SpawnHero', { q0: q(p(0)), p2: p(2), p1: p(1) })
    case 'DeleteHero':
      return i18n.t('triggers.sentence.action.DeleteHero', { q0: q(p(0)) })
    case 'GiveUnitHero':
      return i18n.t('triggers.sentence.action.GiveUnitHero', { p1: p(1), p0: p(0), q2: q(p(2)) })
    case 'GiveUnitHeroPerWeek':
      return i18n.t('triggers.sentence.action.GiveUnitHeroPerWeek', { p1: p(1), p0: p(0), q2: q(p(2)) })
    case 'GiveUnitHeroPerMonth':
      return i18n.t('triggers.sentence.action.GiveUnitHeroPerMonth', { p1: p(1), p0: p(0), q2: q(p(2)) })
    case 'RemoveUnitHero':
      return i18n.t('triggers.sentence.action.RemoveUnitHero', { p1: p(1), p0: p(0), q2: q(p(2)) })
    case 'GiveExpHero':
      return i18n.t('triggers.sentence.action.GiveExpHero', { p0: p(0), q1: q(p(1)) })
    case 'GiveStatsHero':
      return p(1) ? i18n.t('triggers.sentence.action.GiveStatsHero_Hero', { p2: p(2), p0: p(0), q1: q(p(1)) }) : i18n.t('triggers.sentence.action.GiveStatsHero_Selected', { p2: p(2), p0: p(0) })
    case 'GiveManaHero':
      return p(0) ? i18n.t('triggers.sentence.action.GiveManaHero_Hero', { p1: p(1), q0: q(p(0)) }) : i18n.t('triggers.sentence.action.GiveManaHero_Selected', { p1: p(1) })
    case 'ChangeManaHero':
      return p(0) ? i18n.t('triggers.sentence.action.ChangeManaHero_Hero', { q0: q(p(0)), p1: p(1) }) : i18n.t('triggers.sentence.action.ChangeManaHero_Selected', { p1: p(1) })
    case 'AddSpellHero':
      return i18n.t('triggers.sentence.action.AddSpellHero', { q0: q(p(0)), q1: q(p(1)) })
    case 'AddSkillHero':
      return i18n.t('triggers.sentence.action.AddSkillHero', { q0: q(p(0)), q1: q(p(1)) })
    case 'AddSkillAll':
      return i18n.t('triggers.sentence.action.AddSkillAll', { q0: q(p(0)) })
    case 'GiveItemHero':
      return p(1) ? i18n.t('triggers.sentence.action.GiveItemHero_Hero', { q0: q(p(0)), q1: q(p(1)) }) : i18n.t('triggers.sentence.action.GiveItemHero_Selected', { q0: q(p(0)) })
    case 'RemoveItem':
      return i18n.t('triggers.sentence.action.RemoveItem', { q0: q(p(0)) })
    case 'AddBuffHeroDays':
      return p(1) ? i18n.t('triggers.sentence.action.AddBuffHeroDays_Hero', { q0: q(p(0)), q1: q(p(1)) }) : i18n.t('triggers.sentence.action.AddBuffHeroDays_Selected', { q0: q(p(0)) })
    case 'RemoveBuffHero':
      return p(1) ? i18n.t('triggers.sentence.action.RemoveBuffHero_Hero', { q0: q(p(0)), q1: q(p(1)) }) : i18n.t('triggers.sentence.action.RemoveBuffHero_Selected', { q0: q(p(0)) })
    case 'SetHeroMovePoints':
      return p(0) ? i18n.t('triggers.sentence.action.SetHeroMovePoints_Hero', { q0: q(p(0)), p1: p(1) }) : i18n.t('triggers.sentence.action.SetHeroMovePoints_Selected', { p1: p(1) })
    case 'HeroResetMovePointsMax':
      return i18n.t('triggers.sentence.action.HeroResetMovePointsMax', { q0: q(p(0)) })
    case 'HeroStop':
      return i18n.t('triggers.sentence.action.HeroStop')
    case 'StepBack':
      return i18n.t('triggers.sentence.action.StepBack')
    case 'HeroToNode':
      return i18n.t('triggers.sentence.action.HeroToNode', { q0: q(p(0)), p1: p(1) })
    case 'HeroToHero':
      return i18n.t('triggers.sentence.action.HeroToHero', { q0: q(p(0)), q1: q(p(1)) })
    case 'TeleportHero':
      return i18n.t('triggers.sentence.action.TeleportHero', { q0: q(p(0)), nodes: [p(1), p(2), p(3), p(4), p(5)].filter(Boolean).join(i18n.t('triggers.sentence.or')) })
    case 'InitiateInteract':
      return i18n.t('triggers.sentence.action.InitiateInteract', { q0: q(p(0)) })
    case 'InitiateAttack':
      return i18n.t('triggers.sentence.action.InitiateAttack', { q0: q(p(0)) })
    case 'ForceLastInteractObject':
      return i18n.t('triggers.sentence.action.ForceLastInteractObject')
    case 'ForceLastInteractSquad':
      return i18n.t('triggers.sentence.action.ForceLastInteractSquad')
    case 'HeroInteractWorldObject':
      return i18n.t('triggers.sentence.action.HeroInteractWorldObject', { q0: q(p(0)) })
    case 'ResurrectHero':
      return i18n.t('triggers.sentence.action.ResurrectHero', { q0: q(p(0)), p1: p(1) })
    case 'AiBanArea':
      return i18n.t('triggers.sentence.action.AiBanArea', { p0: p(0) })
    case 'AiUnbanArea':
      return i18n.t('triggers.sentence.action.AiUnbanArea', { p0: p(0) })
    case 'AiClearBanArea':
      return i18n.t('triggers.sentence.action.AiClearBanArea')
    case 'AiOnSelectHero':
      return i18n.t('triggers.sentence.action.AiOnSelectHero')
    case 'DisableAIHero':
      return i18n.t('triggers.sentence.action.DisableAIHero', { q0: q(p(0)) })
    case 'EnableAIHero':
      return i18n.t('triggers.sentence.action.EnableAIHero', { q0: q(p(0)) })
    case 'EnableAiResurrect':
      return i18n.t('triggers.sentence.action.EnableAiResurrect', { q0: q(p(0)) })
    case 'DisableAiResurrect':
      return i18n.t('triggers.sentence.action.DisableAiResurrect', { q0: q(p(0)) })
    default: {
      const def = ACTION_REGISTRY[action.a]
      return def ? fallbackSentence(def.label, def.params, action.p ?? []) : (action.a || i18n.t('triggers.sentence.chooseAction'))
    }
  }
}

// ─── Card view: clickable sentence segments ──────────────────────────────────
// Splits a formatted sentence back into plain-text / linked-token segments so
// SentenceView (src/components/triggers/SentenceView.tsx) can render each sid
// as a clickable chip instead of inert text — without duplicating the ~90
// hand-written cases above. Every case already renders its sid params through
// q()/quoting or, for node params, as a bare number, so this scans the
// *already-built* sentence for each param's known raw value and re-tags that
// substring — no case body above needs to know about links at all.

export type SentenceLink =
  | { kind: 'node'; node: number; paramIndex: number }
  | { kind: 'database'; tab: string; id: string }

export interface SentenceSegment {
  text: string
  bold?: boolean
  link?: SentenceLink
  /** Present only for a Dialog SID token — SentenceView renders an eye icon
   *  + hover tooltip with the dialog's localized text instead of a link,
   *  since dialogs have no Game Database tab to navigate to. */
  dialogSid?: string
}

const ENTITY_DB_TAB: Partial<Record<EntityCategory, string>> = {
  creature: 'creatures',
  artifact: 'artifacts',
  mapObject: 'mapObjects',
  spell: 'spells',
  skill: 'skills',
  interactiveObject: 'mapObjects',
  decoration: 'mapObjects',
}

function resolveHeroName(sid: string, catalog: GameCatalog | null | undefined): string | undefined {
  const hero = catalog?.heroes.find((h) => h.id === sid)
  return hero ? localName(catalog, 'heroes', hero) : STATIC_HEROES.find((h) => h.id === sid)?.name
}

function resolveMapEntityCatalogSid(placedObjects: PlacedObject[] | undefined, entitySid: string): string | undefined {
  return placedObjects?.find((o) => o.entitySid === entitySid)?.sid
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface PendingReplacement {
  index: number
  length: number
  segment: SentenceSegment
}

function buildSentenceSegments(sentence: string, params: ParamDef[], rawValues: string[], ctx: SentenceCtx | undefined): SentenceSegment[] {
  const pending: PendingReplacement[] = []

  params.forEach((param, i) => {
    const raw = (rawValues[i] ?? '').trim()
    if (!raw) return

    if (param.nodeIndex) {
      const node = Number(raw)
      if (!Number.isFinite(node)) return
      const m = new RegExp(`\\b${escapeRegExp(raw)}\\b`).exec(sentence)
      if (m) pending.push({ index: m.index, length: raw.length, segment: { text: raw, link: { kind: 'node', node, paramIndex: i } } })
      return
    }

    const quoted = `"${raw}"`
    const index = sentence.indexOf(quoted)
    if (index === -1) return

    if (param.entity === 'hero') {
      const name = resolveHeroName(raw, ctx?.catalog)
      pending.push({ index, length: quoted.length, segment: { text: name ?? raw, bold: true, link: { kind: 'database', tab: 'heroes', id: raw } } })
    } else if (param.ref === 'dialog') {
      pending.push({ index, length: quoted.length, segment: { text: quoted, dialogSid: raw } })
    } else if (param.mapEntity) {
      const catalogSid = resolveMapEntityCatalogSid(ctx?.placedObjects, raw)
      pending.push({
        index,
        length: quoted.length,
        segment: catalogSid ? { text: quoted, link: { kind: 'database', tab: 'mapObjects', id: catalogSid } } : { text: quoted },
      })
    } else if (param.entity && ENTITY_DB_TAB[param.entity]) {
      pending.push({ index, length: quoted.length, segment: { text: quoted, link: { kind: 'database', tab: ENTITY_DB_TAB[param.entity]!, id: raw } } })
    }
  })

  if (pending.length === 0) return [{ text: sentence }]

  pending.sort((a, b) => a.index - b.index)
  const segments: SentenceSegment[] = []
  let cursor = 0
  for (const p of pending) {
    if (p.index < cursor) continue // overlapping match (e.g. two identical node values) — keep the first, drop the rest
    if (p.index > cursor) segments.push({ text: sentence.slice(cursor, p.index) })
    segments.push(p.segment)
    cursor = p.index + p.length
  }
  if (cursor < sentence.length) segments.push({ text: sentence.slice(cursor) })
  return segments
}

export function getConditionSentenceSegments(condition: Condition, ctx?: SentenceCtx): SentenceSegment[] {
  const sentence = formatConditionSentence(condition, ctx)
  const def = CONDITION_REGISTRY[condition.c]
  if (!def) return [{ text: sentence }]
  return buildSentenceSegments(sentence, def.params, condition.p ?? [], ctx)
}

export function getActionSentenceSegments(action: Action, ctx?: SentenceCtx): SentenceSegment[] {
  const sentence = formatActionSentence(action, ctx)
  const def = ACTION_REGISTRY[action.a]
  if (!def) return [{ text: sentence }]
  return buildSentenceSegments(sentence, def.params, action.p ?? [], ctx)
}
