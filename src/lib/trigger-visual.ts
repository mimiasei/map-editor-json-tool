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
  type LucideIcon,
} from 'lucide-react'

// ─── UI-only condition categories ────────────────────────────────────────────
// A friendlier, consolidated regrouping of schema/conditions.ts's comment
// sections (which split into 10 buckets, several with just 1-3 entries) —
// fewer top-level groups is easier to scan when adding a condition. Every
// CONDITION_REGISTRY key still appears in exactly one bucket (55/55 covered),
// including the Tutorial bucket, which stays defined (for icon lookups on
// existing scenario data) even though the add-picker hides it by default.

export interface UiCategory {
  label: string
  icon: LucideIcon
  types: string[]
}

export const CONDITION_UI_CATEGORIES: UiCategory[] = [
  {
    label: 'Progress & Counters',
    icon: Hash,
    types: ['Counter', 'CompareCounters', 'CounterEqualityInDays', 'StoryCounter', 'QuestCompleted'],
  },
  {
    label: 'Time & Turns',
    icon: Clock,
    types: [
      'StartTurn', 'AnyStartTurn', 'StartWeek', 'Difficulty', 'DifficultyCustomMap', 'NodeRevealed',
      'PlayerDefeated', 'CheckLoseIfHeroKilled', 'CheckLoseIfCityLost',
    ],
  },
  {
    label: 'Economy & Buildings',
    icon: Coins,
    types: ['ResCounter', 'BuildingConstruct', 'BuildingOwn'],
  },
  {
    label: 'Army, Items & Heroes',
    icon: Crown,
    types: [
      'SpellCast', 'ItemOwnSide', 'ItemDestroyed', 'UnitOwnSide', 'UnitHire', 'UnitLose', 'UnitKill',
      'ItemOwnHero', 'UnitOwnHero', 'HeroStat',
    ],
  },
  {
    label: 'Hero & Map Events',
    icon: MapPin,
    types: [
      'HeroKill', 'ObjectInteractionBefore', 'ObjectInteractionAfter', 'ObjectCaptureEntity',
      'ObjectCaptureSid', 'MultipleObjectOwn', 'ObjectLose', 'SquadInteraction', 'SquadKill',
    ],
  },
  {
    label: 'Tutorial & UI Prompts',
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

export const ACTION_CATEGORY_ICONS: Record<string, LucideIcon> = {
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

export function getActionCategoryIcon(category: string): LucideIcon {
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

const OPERATOR_WORDS: Record<string, string> = {
  '=': 'equal to',
  '>': 'greater than',
  '<': 'less than',
  '>=': 'at least',
  '<=': 'at most',
}

function opWord(sym: string): string {
  return OPERATOR_WORDS[sym] ?? sym
}

const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Difficult', 'Impossible', 'Lethal']

function difficultyName(index: string): string {
  const n = Number(index)
  return DIFFICULTY_NAMES[n] ?? index
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
  return name ? q(name) : `${q(sid)}${level ? ` (level ${level})` : ''}`
}

export function formatConditionSentence(condition: Condition, ctx?: SentenceCtx): string {
  const p = (i: number) => val(condition, i)
  switch (condition.c) {
    case 'Counter':
      return `${q(p(0))} is ${opWord(p(1))} ${p(2)}`
    case 'CompareCounters':
      return `${q(p(0))} is ${opWord(p(1))} ${q(p(2))}`
    case 'CounterEqualityInDays':
      return `${q(p(0))} hasn't changed for ${p(1)} days`
    case 'StoryCounter':
      return `Campaign counter ${q(p(0))} is ${opWord(p(1))} ${p(2)}`
    case 'QuestCompleted':
      return `Quest ${q(p(0))} is completed`

    case 'Difficulty':
      return `The difficulty is ${difficultyName(p(0))}`
    case 'DifficultyCustomMap':
      return `The ${p(0)} difficulty is ${difficultyName(p(1))}`

    case 'StartTurn': {
      const week = p(0)
      const day = p(1)
      if (!week && !day) return 'Any turn starts'
      const parts = [week && `week ${week}`, day && `day ${day}`].filter(Boolean)
      return `It's ${parts.join(', ')}`
    }
    case 'AnyStartTurn': {
      const [month, week, day] = [p(0), p(1), p(2)]
      const parts = [
        month && month !== '-1' && `month ${month}`,
        week && week !== '-1' && `week ${week}`,
        day && day !== '-1' && `day ${day}`,
      ].filter(Boolean)
      return parts.length ? `It's ${parts.join(', ')}` : 'The nearest turn starts'
    }
    case 'StartWeek':
      return 'A new week begins'
    case 'NodeRevealed':
      return `Node ${p(0)} is revealed`
    case 'PlayerDefeated':
      return `Player ${p(0)} is defeated`
    case 'CheckLoseIfHeroKilled':
      return `Player ${p(0)} has no heroes or castles left (hero check)`
    case 'CheckLoseIfCityLost':
      return `Player ${p(0)} has no heroes or castles left (city check)`

    case 'ResCounter':
      return `The player has ${opWord(p(1))} ${p(2)} ${p(0)}`
    case 'BuildingConstruct':
      return `${buildingLabel(p(0), p(1), p(2), ctx)} is built${p(2) ? ` in ${q(p(2))}` : ''}`
    case 'BuildingOwn':
      return `The player owns ${buildingLabel(p(0), p(1), p(2), ctx)}${p(2) ? ` in ${q(p(2))}` : ''}`

    case 'SpellCast':
      return `The player casts ${q(p(0))}`

    case 'ItemOwnSide':
      return `The player owns ${opWord(p(1))} ${p(2)} of ${p(0) ? q(p(0)) : 'any artifact'}`
    case 'ItemDestroyed':
      return `Item ${q(p(0))} is destroyed`

    case 'UnitOwnSide':
      return `The player owns ${opWord(p(1))} ${p(2)} ${q(p(0))}`
    case 'UnitHire':
      return `The player hires ${q(p(0))}`
    case 'UnitLose':
      return `The player loses ${q(p(0))}`
    case 'UnitKill':
      return `The player kills ${q(p(0))}`

    case 'HeroKill':
      return `Hero ${q(p(0))} is killed or removed`
    case 'ItemOwnHero':
      return `Hero ${q(p(1))} has ${p(0) ? q(p(0)) : 'any artifact'}`
    case 'UnitOwnHero':
      return `Hero ${q(p(0))}'s ${q(p(1))} count is ${opWord(p(2))} ${p(3)}`
    case 'HeroStat':
      return `${p(0) ? `Hero ${q(p(0))}'s` : 'The selected hero\'s'} ${p(1)} is ${opWord(p(2))} ${p(3)}`

    case 'ObjectInteractionBefore':
      return `${p(1) ? `The hero ${q(p(1))}` : 'A hero'} is about to interact with ${q(p(0))}`
    case 'ObjectInteractionAfter':
      return `${p(1) ? `The hero ${q(p(1))}` : 'A hero'} finishes interacting with ${q(p(0))}`
    case 'ObjectCaptureEntity':
      return `${q(p(0))} is captured`
    case 'ObjectCaptureSid':
      return `A ${q(p(0))} is captured`
    case 'MultipleObjectOwn':
      return `The player owns ${opWord(p(1))} ${p(2)} ${q(p(0))}`
    case 'ObjectLose':
      return `${q(p(0))} is lost`
    case 'SquadInteraction':
      return `${p(1) ? `The hero ${q(p(1))}` : 'A hero'} is about to fight ${q(p(0))}`
    case 'SquadKill':
      return `${q(p(0))} is defeated`

    case 'TutorialMovePoints':
      return `A hero's movement points are ${opWord(p(1))} ${p(0)}`
    case 'TutorialOpenCity':
      return 'The player opens a city screen for the first time'
    case 'TutorialShowTooltipSquad':
      return "The player opens a squad's tooltip for the first time"
    case 'TutorialShowTooltipWO':
      return "The player opens an object's tooltip for the first time"
    case 'TutorialResChange':
      return `The player's ${p(0)} changes for the first time`
    case 'TutorialLevelUp':
      return 'A hero levels up for the first time'
    case 'TutorialHeroUI':
      return 'The player opens the hero screen for the first time'
    case 'TutorialMagicGuild':
      return 'The player opens the magic observatory for the first time'
    case 'TutorialOpenFractionLaws':
      return 'The player opens the faction laws window for the first time'
    case 'TutorialLevelUppedFractionLaws':
      return 'The player unlocks a faction law for the first time'
    case 'TutorialOpenMagicBookMap':
      return 'The player opens the spellbook on the map for the first time'
    case 'TutorialHeroInteractWithAllyHero':
      return 'The player interacts with an allied hero for the first time'
    case 'TutorialStartBattleForMap':
      return 'The player enters combat for the first time'
    case 'TutorialStartBattleForCity':
      return 'The player enters a siege battle for the first time'
    case 'TutorialStartBattleForWorldObject':
      return "The player enters a bank's guard battle for the first time"
    case 'TutorialStartTurnUnit':
      return "The player's unit takes its first turn in battle"
    case 'TutorialOpenMagicBookBattle':
      return 'The player opens the spellbook in combat for the first time'
    case 'TutorialBattleEnergy':
      return 'The player accumulates their first energy cell'
    case 'TutorialUnitUI':
      return 'The player opens the detailed unit view for the first time'

    default: {
      const def = CONDITION_REGISTRY[condition.c]
      return def ? fallbackSentence(def.label, def.params, condition.p ?? []) : (condition.c || 'Choose a condition…')
    }
  }
}

export function formatActionSentence(action: Action, ctx?: SentenceCtx): string {
  const p = (i: number) => val(action, i)
  switch (action.a) {
    case 'NextQuest':
      return p(0) ? `Start quest ${q(p(0))}` : 'End the current quest'
    case 'EndQuest':
      return `End quest(s): ${[p(0), p(1), p(2)].filter(Boolean).map(q).join(', ')}`
    case 'NextSubQuest':
      return `Switch to subquest(s): ${[p(0), p(1), p(2)].filter(Boolean).map(q).join(', ')}`
    case 'SubQuestActivate':
      return `Activate subquest ${q(p(1))} in quest ${q(p(0))}`
    case 'SubQuestDeactivate':
      return `Deactivate subquest ${q(p(1))} in quest ${q(p(0))}`
    case 'CurrentSubQuestDone':
      return 'Mark the current subquest as done'
    case 'SubQuestDone':
      return `Mark subquest ${q(p(1))} as done`
    case 'NextAfterGroup':
      return `When group ${q(p(0))} finishes, activate subquest ${q(p(1))}`
    case 'NextQuestAfterGroup':
      return `When group ${q(p(0))} finishes, start quest ${q(p(1))}`
    case 'NextSubGroupAfterGroup':
      return `When group ${q(p(0))} finishes, activate group ${q(p(1))}`
    case 'TriggerClear':
      return `Reset all conditions on trigger #${p(2)} of ${q(p(1))}`
    case 'TriggerClearCustom':
      return `Reset condition #${p(3)} on trigger #${p(2)} of ${q(p(1))}`

    case 'AutoSave':
      return 'Force an autosave'
    case 'Print':
      return `Log a debug message: ${q(p(0))}`
    case 'EnableInterruption':
      return `Enable interruption ${q(p(0))}`
    case 'DisableInterruption':
      return `Disable interruption ${q(p(0))}`
    case 'BreakInterruptions':
      return 'Break the current interruption'

    case 'CounterPlus':
      return `Increase counter ${q(p(0))} by ${p(1)}`
    case 'CounterMinus':
      return `Decrease counter ${q(p(0))} by ${p(1)}`
    case 'CounterSet':
      return `Set counter ${q(p(0))} to ${p(1)}`
    case 'CounterSetRandom':
      return `Set counter ${q(p(0))} to a random value between ${p(1)} and ${p(2)}`
    case 'StoryCounterPlus':
      return `Increase campaign counter ${q(p(0))} by ${p(1)}`
    case 'StoryCounterMinus':
      return `Decrease campaign counter ${q(p(0))} by ${p(1)}`
    case 'StoryCounterSet':
      return `Set campaign counter ${q(p(0))} to ${p(1)}`

    case 'Dialog':
      return `Show dialog ${q(p(0))}`
    case 'DialogIfHero':
      return `If the hero is ${q(p(1))}, show dialog ${q(p(0))}`
    case 'DialogIfRes':
      return `If the player has ${opWord(p(2))} ${p(3)} ${p(1)}, show dialog ${q(p(0))}`
    case 'DialogIfCounter':
      return `If counter ${q(p(1))} is ${opWord(p(2))} ${p(3)}, show dialog ${q(p(0))}`
    case 'DialogIfItem':
      return `If the hero has ${q(p(1))}, show dialog ${q(p(0))}`
    case 'RandomDialog':
      return `Show a random dialog from: ${[p(0), p(1), p(2), p(3), p(4)].filter(Boolean).map(q).join(', ')}`
    case 'DialogOne':
      return `Show dialog ${q(p(0))} (only once)`
    case 'DialogOneIfHero':
      return `If the hero is ${q(p(1))}, show dialog ${q(p(0))} (only once)`
    case 'DialogOneIfRes':
      return `If the player has ${opWord(p(2))} ${p(3)} ${p(1)}, show dialog ${q(p(0))} (only once)`
    case 'DialogOneIfCounter':
      return `If counter ${q(p(1))} is ${opWord(p(2))} ${p(3)}, show dialog ${q(p(0))} (only once)`

    case 'ShowFloatingUI':
      return `Show floating text ${q(p(1))} above the selected hero`
    case 'OpenUI':
      return `Open the ${p(0)} screen`
    case 'Guide':
      return `Open tutorial guide ${q(p(0))}`

    case 'GameVictory':
      return 'Force the player to win'
    case 'GameLose':
      return 'Force the player to lose'
    case 'SideLose':
      return `Force player ${p(0)} to lose`
    case 'ChangeCampaignOneStep':
      return `${p(0) === 'true' ? 'Enable' : 'Disable'} single-turn mode`
    case 'AddGlobalBuff':
      return `Apply global buff ${q(p(0))}`
    case 'RemoveGlobalBuff':
      return `Remove global buff ${q(p(0))}`

    case 'MoveCamera':
      return `Move the camera to node ${p(0)}`
    case 'MoveCameraToSelectHero':
      return 'Move the camera to the selected hero'
    case 'RevealFogOfWar':
      return `Reveal fog of war around node ${p(0)}`
    case 'CreateFogOfWar':
      return `Create fog of war around node ${p(0)}`

    case 'GiveRes':
      return `Give ${p(1)} ${p(0)} to the player`
    case 'RemoveRes':
      return `Take ${p(1)} ${p(0)} from the player`
    case 'UnlockSpell':
      return `Unlock spell ${q(p(0))}`
    case 'UnlockBuildingCity':
      return `Unlock building ${buildingLabel(p(0), p(1), p(2), ctx)} in ${q(p(2))}`
    case 'CreateBuildingCity':
      return `Build ${buildingLabel(p(0), p(1), p(2), ctx)} in ${q(p(2))}`
    case 'CaptureObject':
      return `Capture ${q(p(0))}`
    case 'LoseObject':
      return `Make ${q(p(0))} neutral`

    case 'SpawnObject':
      return `Create object ${q(p(0))} at node ${p(1)}`
    case 'SpawnMapObject':
      return `Create decoration ${q(p(0))} at node ${p(1)}`
    case 'CreateVFX':
      return `Create effect ${q(p(0))} at node ${p(1)}`
    case 'EventBankRefresh':
      return `Recharge ${q(p(0))}`
    case 'SetActiveVFX':
      return `${p(1) === 'true' ? 'Show' : 'Hide'} effect ${q(p(0))}`
    case 'SetQuestMarker':
      return `Add a quest marker to ${q(p(0))}`
    case 'SetActiveQuestMarker':
      return `${p(1) === 'true' ? 'Show' : 'Hide'} the quest marker on ${q(p(0))}`
    case 'SetActivePortal':
      return `${p(1) === 'true' ? 'Enable' : 'Disable'} portal ${q(p(0))}`
    case 'SetActiveMarker':
      return `${p(1) === 'true' ? 'Enable' : 'Disable'} trigger zone ${q(p(0))}`
    case 'DeleteEntity':
      return `Delete ${q(p(0))}`
    case 'DeleteMarkerByNode':
      return `Delete the trigger zone at node ${p(0)}`
    case 'EntityActionsOff':
      return `Disable all triggers on ${q(p(0))}`

    case 'SpawnSquad':
      return `Spawn a neutral squad ${q(p(0))} at node ${p(1)}`
    case 'SpawnSquadNPC':
      return `Spawn an NPC squad ${q(p(0))} at node ${p(1)}`
    case 'SetFlagEscape':
      return `${p(1) === 'true' ? 'Allow' : 'Prevent'} ${q(p(0))} from fleeing`
    case 'SetFlagAutobattle':
      return `${p(1) === 'true' ? 'Allow' : 'Prevent'} ${q(p(0))} from auto-battling`
    case 'ChangeCampaignDiplomacy':
      return `${p(1) === 'true' ? 'Enable' : 'Disable'} guaranteed free join for ${q(p(0))}`
    case 'ChangeAlwaysDiplomacy':
      return `${p(1) === 'true' ? 'Enable' : 'Disable'} diplomacy offers for ${q(p(0))}`
    case 'ChangeSquadReactionType':
      return `Set ${q(p(0))}'s mood to ${p(1)}`
    case 'IncreaseStrengthSquad':
      return `Increase ${q(p(0))}'s strength by ${p(1)}`
    case 'ReduceStrengthSquad':
      return `Reduce ${q(p(0))}'s strength by ${p(1)}`
    case 'DeleteSquad':
      return `Remove squad ${q(p(0))}`

    case 'SpawnHero':
      return `Spawn hero ${q(p(0))} for player ${p(2)} at node ${p(1)}`
    case 'DeleteHero':
      return `Remove hero ${q(p(0))}`
    case 'GiveUnitHero':
      return `Give ${p(1)} ${p(0)} to hero ${q(p(2))}`
    case 'GiveUnitHeroPerWeek':
      return `Give (${p(1)} × week) ${p(0)} to hero ${q(p(2))}`
    case 'GiveUnitHeroPerMonth':
      return `Give (${p(1)} × month) ${p(0)} to hero ${q(p(2))}`
    case 'RemoveUnitHero':
      return `Remove ${p(1)} ${p(0)} from hero ${q(p(2))}`
    case 'GiveExpHero':
      return `Give ${p(0)} experience to hero ${q(p(1))}`
    case 'GiveStatsHero':
      return `Give ${p(2)} ${p(0)} to ${p(1) ? `hero ${q(p(1))}` : 'the selected hero'}`
    case 'GiveManaHero':
      return `Give ${p(1)} mana to ${p(0) ? `hero ${q(p(0))}` : 'the selected hero'}`
    case 'ChangeManaHero':
      return `Set ${p(0) ? `hero ${q(p(0))}'s` : "the selected hero's"} mana to ${p(1)}`
    case 'AddSpellHero':
      return `Teach spell ${q(p(0))} to hero ${q(p(1))}`
    case 'AddSkillHero':
      return `Add skill ${q(p(0))} to hero ${q(p(1))}`
    case 'AddSkillAll':
      return `Add skill ${q(p(0))} to all heroes`
    case 'GiveItemHero':
      return `Give item ${q(p(0))} to ${p(1) ? `hero ${q(p(1))}` : 'the selected hero'}`
    case 'RemoveItem':
      return `Remove item ${q(p(0))} from the player`
    case 'AddBuffHeroDays':
      return `Apply buff ${q(p(0))} to ${p(1) ? `hero ${q(p(1))}` : 'the selected hero'}`
    case 'RemoveBuffHero':
      return `Remove buff ${q(p(0))} from ${p(1) ? `hero ${q(p(1))}` : 'the selected hero'}`
    case 'SetHeroMovePoints':
      return `Set ${p(0) ? `hero ${q(p(0))}'s` : "the selected hero's"} movement points to ${p(1)}`
    case 'HeroResetMovePointsMax':
      return `Zero out hero ${q(p(0))}'s max movement`
    case 'HeroStop':
      return 'Stop the selected hero'
    case 'StepBack':
      return 'Step the selected hero back'
    case 'HeroToNode':
      return `Move hero ${q(p(0))} to node ${p(1)}`
    case 'HeroToHero':
      return `Move hero ${q(p(0))} toward hero ${q(p(1))}`
    case 'TeleportHero':
      return `Teleport hero ${q(p(0))} to node ${[p(1), p(2), p(3), p(4), p(5)].filter(Boolean).join(' or ')}`
    case 'InitiateInteract':
      return `Interact with ${q(p(0))}`
    case 'InitiateAttack':
      return `Attack ${q(p(0))}`
    case 'ForceLastInteractObject':
      return 'Interact with the last object again'
    case 'ForceLastInteractSquad':
      return 'Interact with the last squad again'
    case 'HeroInteractWorldObject':
      return `Have hero ${q(p(0))} interact with the nearest object`
    case 'ResurrectHero':
      return `Resurrect hero ${q(p(0))} at node ${p(1)}`

    case 'AiBanArea':
      return `Ban the AI from the area around node ${p(0)}`
    case 'AiUnbanArea':
      return `Unban the AI for the area around node ${p(0)}`
    case 'AiClearBanArea':
      return 'Clear all AI area bans'
    case 'AiOnSelectHero':
      return "Recalculate the AI's objectives"
    case 'DisableAIHero':
      return `Disable AI for hero ${q(p(0))}`
    case 'EnableAIHero':
      return `Enable AI for hero ${q(p(0))}`
    case 'EnableAiResurrect':
      return `Enable auto-resurrection for hero ${q(p(0))}`
    case 'DisableAiResurrect':
      return `Disable auto-resurrection for hero ${q(p(0))}`

    default: {
      const def = ACTION_REGISTRY[action.a]
      return def ? fallbackSentence(def.label, def.params, action.p ?? []) : (action.a || 'Choose an action…')
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
}

function resolveHeroName(sid: string, catalog: GameCatalog | null | undefined): string | undefined {
  return catalog?.heroes.find((h) => h.id === sid)?.name ?? STATIC_HEROES.find((h) => h.id === sid)?.name
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
