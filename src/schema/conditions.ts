// ─── Condition registry ─────────────────────────────────────────────────────────
// Defines all known condition types, their labels, descriptions, and parameters.
// Source: https://unfrozen.notion.site/Conditions-and-their-parameters-Full-list-...
// The tool supports custom/unknown types — users can type any string as the type.

import type { EntityCategory } from './entities'

export interface ParamDef {
  label: string
  hint?: string
  required: boolean
  type?: 'string' | 'number' | 'enum'
  options?: string[] // For enum type
  ref?: 'counter' | 'quest' | 'subquest' | 'interruption' // SID cross-reference: show autocomplete from this pool
  entity?: EntityCategory // Entity registry: show searchable combobox from static list
  mapEntity?: true // Map entity SID: show autocomplete from user-placed entities in the loaded .map file
}

export interface ConditionDef {
  type: string
  label: string
  description: string
  params: ParamDef[]
  extraFields?: Record<string, ParamDef> // Named fields beyond "p" (e.g. counter on StartTurn)
}

export const CONDITION_REGISTRY: Record<string, ConditionDef> = {

  // ── Counters / Special Checks ──────────────────────────────────────────────

  Counter: {
    type: 'Counter',
    label: 'Counter Check',
    description: 'Triggers when the value of a local counter with the specified SID satisfies the inequality for the first time.',
    params: [
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CompareCounters: {
    type: 'CompareCounters',
    label: 'Compare Two Counters',
    description: 'Triggers when, after changing either of the two specified counters, their values satisfy the inequality for the first time.',
    params: [
      { label: 'Counter SID 1', hint: 'e.g. counter_a', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Counter SID 2', hint: 'e.g. counter_b', required: true, ref: 'counter' },
    ],
  },
  CounterEqualityInDays: {
    type: 'CounterEqualityInDays',
    label: 'Counter Unchanged for N Days',
    description: 'Triggers if the value of the counter does not change for X days in a row. Used to call actions N days after an event.',
    params: [
      { label: 'Counter SID', hint: 'e.g. delay_counter', required: true, ref: 'counter' },
      { label: 'Days', hint: 'e.g. 3', required: true, type: 'number' },
    ],
  },
  StoryCounter: {
    type: 'StoryCounter',
    label: 'Campaign Counter Check',
    description: 'Triggers when the value of a campaign (story) counter satisfies the inequality for the first time. Campaign counters persist across missions.',
    params: [
      { label: 'Story Counter SID', hint: 'e.g. campaign_stage', required: true },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  QuestCompleted: {
    type: 'QuestCompleted',
    label: 'Quest Completed',
    description: 'Triggers when the quest with the specified SID is turned off (does not distinguish completed vs. failed).',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
    ],
  },

  // ── Current Difficulty ─────────────────────────────────────────────────────

  Difficulty: {
    type: 'Difficulty',
    label: 'Campaign Difficulty Check',
    description: 'Triggers at the start of a new day if the current campaign mission difficulty matches the specified index. 0=Easy, 1=Normal, 2=Difficult, 3=Impossible, 4=Lethal.',
    params: [
      {
        label: 'Difficulty index',
        hint: '0–4',
        required: true,
        type: 'enum',
        options: ['0', '1', '2', '3', '4'],
      },
    ],
  },
  DifficultyCustomMap: {
    type: 'DifficultyCustomMap',
    label: 'Custom Map Difficulty Check',
    description: 'Triggers at the start of a new day if the custom map difficulty matches. typeDifficulty: Economy/Neutral/Ai. Index: 0=Easy, 1=Normal, 2=Difficult, 3=Impossible, 4=Lethal.',
    params: [
      {
        label: 'Difficulty type',
        hint: 'Neutral',
        required: true,
        type: 'enum',
        options: ['Economy', 'Neutral', 'Ai'],
      },
      {
        label: 'Difficulty index',
        hint: '0–4',
        required: true,
        type: 'enum',
        options: ['0', '1', '2', '3', '4'],
      },
    ],
  },

  // ── Global Events ──────────────────────────────────────────────────────────

  StartTurn: {
    type: 'StartTurn',
    label: 'Start of Turn (Week/Day)',
    description: 'Triggers at the start of a specific turn. Params: weekNumber, dayNumber (both optional). Only works for weeks 1–4, month 1. Omit params for any turn. Use "counter: X" to fire after X days instead.',
    params: [
      { label: 'Week number', hint: 'e.g. 1 (optional)', required: false, type: 'number' },
      { label: 'Day number', hint: 'e.g. 3 (optional)', required: false, type: 'number' },
    ],
    extraFields: {
      counter: { label: 'After X days (counter)', hint: 'Fires after X days have passed', required: false, type: 'number' },
    },
  },
  AnyStartTurn: {
    type: 'AnyStartTurn',
    label: 'Any Turn Start (Month/Week/Day)',
    description: 'Triggers at the start of a specific month/week/day. Use -1 for "any". [-1,-1,-1] = nearest turn start.',
    params: [
      { label: 'Month', hint: '-1 = any', required: false, type: 'number' },
      { label: 'Week', hint: '-1 = any', required: false, type: 'number' },
      { label: 'Day', hint: '-1 = any', required: false, type: 'number' },
    ],
  },
  StartWeek: {
    type: 'StartWeek',
    label: 'Start of Week',
    description: 'Triggers when a new week begins. Use "counter: X" to require X week starts. Omit counter for nearest week start.',
    params: [],
    extraFields: {
      counter: { label: 'Week count (counter)', hint: 'Triggers after X weeks', required: false, type: 'number' },
    },
  },
  NodeRevealed: {
    type: 'NodeRevealed',
    label: 'Node Revealed',
    description: 'Triggers when the node with the specified index has been revealed from fog of war.',
    params: [
      { label: 'Node index', hint: 'e.g. 1458 (hover cell in editor)', required: true },
    ],
  },
  PlayerDefeated: {
    type: 'PlayerDefeated',
    label: 'Player Defeated',
    description: 'DEPRECATED — use CheckLoseIfHeroKilled + CheckLoseIfCityLost instead. Triggers when the player with the specified index is completely removed from the map.',
    params: [
      { label: 'Player index', hint: '0=Player1, 1=Player2, etc.', required: true, type: 'enum', options: ['0', '1', '2', '3'] },
    ],
  },
  CheckLoseIfHeroKilled: {
    type: 'CheckLoseIfHeroKilled',
    label: 'Check Lose: Hero Killed',
    description: 'Auxiliary condition. Triggers if the player loses a hero and has no castles/heroes remaining. Use only in an "Or" combination with CheckLoseIfCityLost.',
    params: [
      { label: 'Player index', hint: '0=Player1, 1=Player2, etc.', required: true, type: 'enum', options: ['0', '1', '2', '3'] },
    ],
  },
  CheckLoseIfCityLost: {
    type: 'CheckLoseIfCityLost',
    label: 'Check Lose: City Lost',
    description: 'Auxiliary condition. Triggers if the player loses a castle and has no castles/heroes remaining. Use only in an "Or" combination with CheckLoseIfHeroKilled.',
    params: [
      { label: 'Player index', hint: '0=Player1, 1=Player2, etc.', required: true, type: 'enum', options: ['0', '1', '2', '3'] },
    ],
  },

  // ── Economy ────────────────────────────────────────────────────────────────

  ResCounter: {
    type: 'ResCounter',
    label: 'Resource Check',
    description: "Triggers when the player's simultaneously accumulated resource satisfies the inequality for the first time.",
    params: [
      {
        label: 'Resource',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
      { label: 'Operator', hint: '>=', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 20', required: true, type: 'number' },
    ],
  },
  BuildingConstruct: {
    type: 'BuildingConstruct',
    label: 'Building Constructed',
    description: 'Triggers when the player constructs a building with the specified SID at the specified level in the given castle entity. Leave entityCity blank for any castle.',
    params: [
      { label: 'Building SID', hint: 'e.g. mage_guild', required: true },
      { label: 'Level', hint: '1–5', required: true, type: 'enum', options: ['1', '2', '3', '4', '5'] },
      { label: 'Castle entity', hint: 'Leave blank for any castle', required: false, mapEntity: true },
    ],
  },
  BuildingOwn: {
    type: 'BuildingOwn',
    label: 'Building Owned',
    description: 'Triggers if the player controls a castle with the specified entity that has the building already constructed. Leave entityCity blank for any castle.',
    params: [
      { label: 'Building SID', hint: 'e.g. mage_guild', required: true },
      { label: 'Level', hint: '1–5', required: true, type: 'enum', options: ['1', '2', '3', '4', '5'] },
      { label: 'Castle entity', hint: 'Leave blank for any castle', required: false, mapEntity: true },
    ],
  },

  // ── Spells ─────────────────────────────────────────────────────────────────

  SpellCast: {
    type: 'SpellCast',
    label: 'Spell Cast',
    description: 'Triggers when the player casts the specified spell X times (set counter). Applies to both combat and adventure map spells.',
    params: [
      { label: 'Spell SID', hint: 'e.g. day_1_magic_healing_water', required: true, entity: 'spell' as EntityCategory },
    ],
    extraFields: {
      counter: { label: 'Cast count (counter)', hint: 'Number of casts required', required: false, type: 'number' },
    },
  },

  // ── Artifacts ──────────────────────────────────────────────────────────────

  ItemOwnSide: {
    type: 'ItemOwnSide',
    label: 'Item Owned (Side)',
    description: "Triggers when the total number of artifacts with the specified SID held by the player satisfies the inequality. Leave SID blank for any artifact.",
    params: [
      { label: 'Item SID', hint: 'Leave blank for any artifact', required: false, entity: 'artifact' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  ItemDestroyed: {
    type: 'ItemDestroyed',
    label: 'Item Destroyed',
    description: 'Triggers when the player destroys (dismantles) an artifact with the specified SID.',
    params: [
      { label: 'Item SID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
    ],
  },

  // ── Units ──────────────────────────────────────────────────────────────────

  UnitOwnSide: {
    type: 'UnitOwnSide',
    label: 'Unit Owned (Side)',
    description: "Triggers when the total number of units with the specified SID belonging to the player satisfies the inequality for the first time.",
    params: [
      { label: 'Unit SID', hint: 'e.g. lich_upg_alt', required: true, entity: 'creature' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  UnitHire: {
    type: 'UnitHire',
    label: 'Unit Hired',
    description: 'Triggers when the player recruits X units with the specified SID (direct purchase only). Set counter to require N hires.',
    params: [
      { label: 'Unit SID', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Hire count (counter)', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  UnitLose: {
    type: 'UnitLose',
    label: 'Unit Lost',
    description: 'Triggers when the player loses X units with the specified SID (death in combat or dismissed). Set counter to require N losses.',
    params: [
      { label: 'Unit SID', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Loss count (counter)', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  UnitKill: {
    type: 'UnitKill',
    label: 'Unit Killed',
    description: 'Triggers when the player kills X units with the specified SID (enemy units only). Set counter to require N kills.',
    params: [
      { label: 'Unit SID', hint: 'e.g. elf_tracker', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Kill count (counter)', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },

  // ── Heroes ─────────────────────────────────────────────────────────────────

  HeroKill: {
    type: 'HeroKill',
    label: 'Hero Killed / Removed',
    description: 'Triggers when the hero with the specified SID is removed in any way (DeleteHero, defeat, retreat, surrender). Does NOT trigger for temporary removal.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  ItemOwnHero: {
    type: 'ItemOwnHero',
    label: 'Item Owned by Hero',
    description: 'Triggers when an artifact with the specified SID appears in the inventory of the specified hero for the first time. Leave item SID blank for any artifact.',
    params: [
      { label: 'Item SID', hint: 'Leave blank for any artifact', required: false, entity: 'artifact' },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  UnitOwnHero: {
    type: 'UnitOwnHero',
    label: 'Unit Owned (Hero)',
    description: 'Triggers when the number of units with the specified SID belonging to the specified hero satisfies the inequality for the first time.',
    params: [
      { label: 'Hero SID', hint: 'e.g. cm_fun_hero_1', required: true, entity: 'hero' },
      { label: 'Unit SID', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  HeroStat: {
    type: 'HeroStat',
    label: 'Hero Stat Check',
    description: 'Triggers when the numerical value of the specified stat of the hero satisfies the inequality for the first time. Leave hero SID blank for the currently selected hero.',
    params: [
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      {
        label: 'Stat',
        hint: 'offence',
        required: true,
        type: 'enum',
        options: ['offence', 'defence', 'spellPower', 'intelligence', 'luck', 'moral'],
      },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 5', required: true, type: 'number' },
    ],
  },

  // ── Objects / Squads on the Map ────────────────────────────────────────────

  ObjectInteractionBefore: {
    type: 'ObjectInteractionBefore',
    label: 'Object Interaction (Before)',
    description: 'Triggers BEFORE the hero interacts with the specified interactive object (akin to Actions Before). Leave hero SID blank for any human player\'s hero.',
    params: [
      { label: 'Object entity', hint: 'e.g. amplifier', required: true, mapEntity: true },
      { label: 'Hero SID', hint: 'Leave blank for any hero', required: false, entity: 'hero' },
    ],
  },
  ObjectInteractionAfter: {
    type: 'ObjectInteractionAfter',
    label: 'Object Interaction (After)',
    description: 'Triggers AFTER the hero interacts with the specified interactive object (akin to Actions After). Leave hero SID blank for any human player\'s hero.',
    params: [
      { label: 'Object entity', hint: 'e.g. dragon_utopia', required: true, mapEntity: true },
      { label: 'Hero SID', hint: 'Leave blank for any hero', required: false, entity: 'hero' },
    ],
  },
  ObjectCaptureEntity: {
    type: 'ObjectCaptureEntity',
    label: 'Object Captured (Entity)',
    description: 'Triggers when the player captures an object with the specified entity for the first time. Works on mines, barracks, castles and certain special objects.',
    params: [
      { label: 'Object entity', hint: 'e.g. mine1', required: true, mapEntity: true },
    ],
  },
  ObjectCaptureSid: {
    type: 'ObjectCaptureSid',
    label: 'Object Captured (SID)',
    description: 'Triggers when the player captures an object with the specified SID X times (set counter). Also counts repeated captures of the same object.',
    params: [
      { label: 'Object SID', hint: 'e.g. gold_mine', required: true },
    ],
    extraFields: {
      counter: { label: 'Capture count (counter)', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  MultipleObjectOwn: {
    type: 'MultipleObjectOwn',
    label: 'Multiple Objects Owned',
    description: 'Triggers when the number of objects with the specified SID captured by the player satisfies the inequality for the first time.',
    params: [
      { label: 'Object SID', hint: 'e.g. gold_mine', required: true },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 3', required: true, type: 'number' },
    ],
  },
  ObjectLose: {
    type: 'ObjectLose',
    label: 'Object Lost',
    description: 'Triggers when an object with the specified entity belonging to the player is captured by another player for the first time.',
    params: [
      { label: 'Object entity', hint: 'e.g. city', required: true, mapEntity: true },
    ],
  },
  SquadInteraction: {
    type: 'SquadInteraction',
    label: 'Squad Interaction (Before Battle)',
    description: 'Triggers BEFORE the specified hero interacts with the neutral squad (akin to Actions Before). Leave hero SID blank for any human player\'s hero. NOTE: Do NOT use for dialogues — cannot interrupt battle start.',
    params: [
      { label: 'Squad entity', hint: 'e.g. pixie1', required: true, mapEntity: true },
      { label: 'Hero SID', hint: 'Leave blank for any hero', required: false, entity: 'hero' },
    ],
  },
  SquadKill: {
    type: 'SquadKill',
    label: 'Squad Killed (After Battle)',
    description: 'Triggers AFTER the specified neutral squad is killed by any player (akin to Actions After). Leave hero SID blank for any hero.',
    params: [
      { label: 'Squad entity', hint: 'e.g. E_Squad', required: true, mapEntity: true },
      { label: 'Hero SID', hint: 'Leave blank for any hero', required: false, entity: 'hero' },
    ],
  },

  // ── Tutorial-Related ───────────────────────────────────────────────────────

  TutorialMovePoints: {
    type: 'TutorialMovePoints',
    label: 'Tutorial: Move Points',
    description: 'Triggers when the specified hero has a number of movement points satisfying the inequality after stopping. Leave hero SID blank for any hero.',
    params: [
      { label: 'Value', hint: 'e.g. 100', required: true, type: 'number' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Hero SID', hint: 'Leave blank for any hero', required: false, entity: 'hero' },
    ],
  },
  TutorialOpenCity: {
    type: 'TutorialOpenCity',
    label: 'Tutorial: Open City',
    description: 'Triggers when the player opens the city screen for the first time.',
    params: [],
  },
  TutorialShowTooltipSquad: {
    type: 'TutorialShowTooltipSquad',
    label: 'Tutorial: Show Squad Tooltip',
    description: 'Triggers when the player opens the tooltip of a neutral squad for the first time.',
    params: [],
  },
  TutorialShowTooltipWO: {
    type: 'TutorialShowTooltipWO',
    label: 'Tutorial: Show Object Tooltip',
    description: 'Triggers when the player opens the tooltip of any interactive object (except a city) for the first time.',
    params: [],
  },
  TutorialResChange: {
    type: 'TutorialResChange',
    label: 'Tutorial: Resource Changed',
    description: 'Triggers when the player\'s amount of the specified resource changes for the first time.',
    params: [
      {
        label: 'Resource SID',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
    ],
  },
  TutorialLevelUp: {
    type: 'TutorialLevelUp',
    label: 'Tutorial: Level Up',
    description: 'Triggers when the player levels up a hero for the first time.',
    params: [],
  },
  TutorialHeroUI: {
    type: 'TutorialHeroUI',
    label: 'Tutorial: Open Hero UI',
    description: 'Triggers when the player opens the hero interface for the first time.',
    params: [],
  },
  TutorialMagicGuild: {
    type: 'TutorialMagicGuild',
    label: 'Tutorial: Open Magic Observatory',
    description: 'Triggers when the player opens the magic observatory window for the first time.',
    params: [],
  },
  TutorialOpenFractionLaws: {
    type: 'TutorialOpenFractionLaws',
    label: 'Tutorial: Open Faction Laws',
    description: 'Triggers when the player opens the faction laws window for the first time.',
    params: [],
  },
  TutorialLevelUppedFractionLaws: {
    type: 'TutorialLevelUppedFractionLaws',
    label: 'Tutorial: Faction Law Unlocked',
    description: 'Triggers when the player accumulates enough experience to learn a faction law for the first time.',
    params: [],
  },
  TutorialOpenMagicBookMap: {
    type: 'TutorialOpenMagicBookMap',
    label: 'Tutorial: Open Spellbook (Map)',
    description: 'Triggers when the player opens the spellbook on the map for the first time.',
    params: [],
  },
  TutorialHeroInteractWithAllyHero: {
    type: 'TutorialHeroInteractWithAllyHero',
    label: 'Tutorial: Interact with Ally Hero',
    description: 'Triggers when the player interacts with an allied hero for the first time.',
    params: [],
  },
  TutorialStartBattleForMap: {
    type: 'TutorialStartBattleForMap',
    label: 'Tutorial: Start Battle (Map)',
    description: 'Triggers when the player enters combat for the first time (tactical phase starts).',
    params: [],
  },
  TutorialStartBattleForCity: {
    type: 'TutorialStartBattleForCity',
    label: 'Tutorial: Start Siege Battle',
    description: 'Triggers when the player enters a siege battle for the first time (tactical phase starts).',
    params: [],
  },
  TutorialStartBattleForWorldObject: {
    type: 'TutorialStartBattleForWorldObject',
    label: 'Tutorial: Start Bank Battle',
    description: 'Triggers when the player enters combat with a bank\'s inner guard for the first time (tactical phase starts).',
    params: [],
  },
  TutorialStartTurnUnit: {
    type: 'TutorialStartTurnUnit',
    label: 'Tutorial: Unit Turn in Battle',
    description: 'Triggers when the turn passes to a player\'s stack in combat for the first time.',
    params: [],
  },
  TutorialOpenMagicBookBattle: {
    type: 'TutorialOpenMagicBookBattle',
    label: 'Tutorial: Open Spellbook (Battle)',
    description: 'Triggers when the player opens the spellbook in combat for the first time.',
    params: [],
  },
  TutorialBattleEnergy: {
    type: 'TutorialBattleEnergy',
    label: 'Tutorial: Battle Energy',
    description: 'Triggers when the player accumulates 1 energy cell for the first time.',
    params: [],
  },
  TutorialUnitUI: {
    type: 'TutorialUnitUI',
    label: 'Tutorial: Open Unit View',
    description: 'Triggers when the player opens the detailed unit view window for the first time.',
    params: [],
  },
}

export const CONDITION_LIST: ConditionDef[] = Object.values(CONDITION_REGISTRY)
