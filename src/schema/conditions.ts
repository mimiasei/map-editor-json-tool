// ─── Condition registry ─────────────────────────────────────────────────────────
// Defines all known condition types, their labels, descriptions, and parameters.
// The tool supports custom/unknown types — users can type any string as the type.

export interface ParamDef {
  label: string
  hint?: string
  required: boolean
  type?: 'string' | 'number' | 'enum'
  options?: string[] // For enum type
  ref?: 'counter' | 'quest' | 'subquest' | 'interruption' // SID cross-reference: show autocomplete from this pool
  entity?: 'hero' | 'creature' | 'artifact' | 'mapObject' // Entity registry: show searchable combobox from static list
}

export interface ConditionDef {
  type: string
  label: string
  description: string
  params: ParamDef[]
  extraFields?: Record<string, ParamDef> // Named fields beyond "p" (e.g. counter on StartTurn)
}

export const CONDITION_REGISTRY: Record<string, ConditionDef> = {
  StartTurn: {
    type: 'StartTurn',
    label: 'Start of Turn',
    description: 'Fires at the start of a specific turn for a specific player. Omit params for any turn.',
    params: [
      { label: 'Turn number', hint: 'e.g. 1', required: false, type: 'number' },
      { label: 'Player', hint: 'e.g. 1', required: false, type: 'number' },
    ],
    extraFields: {
      counter: { label: 'Counter value', hint: 'Turn count threshold', required: false, type: 'number' },
    },
  },
  StartWeek: {
    type: 'StartWeek',
    label: 'Start of Week',
    description: 'Fires at the start of any week.',
    params: [],
  },
  AnyStartTurn: {
    type: 'AnyStartTurn',
    label: 'Any Player Turn Start',
    description: "Fires at the start of any player's turn.",
    params: [
      { label: 'Param 1', hint: '-1', required: false },
      { label: 'Param 2', hint: '-1', required: false },
      { label: 'Param 3', hint: '-1', required: false },
    ],
  },
  Counter: {
    type: 'Counter',
    label: 'Counter Check',
    description: 'Checks a counter against a value.',
    params: [
      { label: 'Counter ID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Operator', hint: '=', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<=', '!='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  HeroKill: {
    type: 'HeroKill',
    label: 'Hero Killed',
    description: 'Fires when the specified hero is killed.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  SquadKill: {
    type: 'SquadKill',
    label: 'Squad Defeated',
    description: 'Fires when the specified squad/neutral stack is defeated.',
    params: [
      { label: 'Squad ID', hint: 'e.g. E_Squad', required: true },
    ],
  },
  ObjectLose: {
    type: 'ObjectLose',
    label: 'Object Lost',
    description: 'Fires when the specified map object (e.g. a town) is lost/captured by the enemy.',
    params: [
      { label: 'Object ID', hint: 'e.g. city', required: true, entity: 'mapObject' },
    ],
  },
  DifficultyCustomMap: {
    type: 'DifficultyCustomMap',
    label: 'Difficulty Check',
    description: 'Checks the custom map difficulty level. Used to branch behavior per difficulty tier.',
    params: [
      { label: 'Type', hint: 'Neutral', required: true, type: 'enum', options: ['Neutral', 'Economy', 'Ai'] },
      { label: 'Level', hint: '1, 2, or 3', required: true, type: 'enum', options: ['1', '2', '3'] },
    ],
  },
  NodeRevealed: {
    type: 'NodeRevealed',
    label: 'Node Revealed',
    description: 'Fires when a specific map node is revealed (fog of war lifted).',
    params: [
      { label: 'Node ID', hint: 'e.g. 1458', required: true },
    ],
  },
  SquadInteraction: {
    type: 'SquadInteraction',
    label: 'Squad Interaction',
    description: 'Fires when the player interacts with a neutral squad/stack.',
    params: [
      { label: 'Squad entity ID', hint: 'e.g. pixie1', required: true },
    ],
  },
  UnitOwnSide: {
    type: 'UnitOwnSide',
    label: 'Unit Owned (Side)',
    description: "Checks how many of a unit type the player's side owns across all armies.",
    params: [
      { label: 'Unit type', hint: 'e.g. lich_upg_alt', required: true, entity: 'creature' },
      { label: 'Operator', hint: '=', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<=', '!='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  UnitOwnHero: {
    type: 'UnitOwnHero',
    label: 'Unit Owned (Hero)',
    description: 'Checks how many of a unit type a specific hero owns.',
    params: [
      { label: 'Hero ID', hint: 'e.g. cm_fun_hero_1', required: true, entity: 'hero' },
      { label: 'Unit type', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
      { label: 'Operator', hint: '=', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<=', '!='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  UnitKill: {
    type: 'UnitKill',
    label: 'Unit Killed',
    description: 'Fires when a unit type is killed. Set counter to require N kills.',
    params: [
      { label: 'Unit type', hint: 'e.g. elf_tracker', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Kill count threshold', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  UnitLose: {
    type: 'UnitLose',
    label: 'Unit Lost',
    description: 'Fires when a unit type is lost (killed on your side). Set counter to require N losses.',
    params: [
      { label: 'Unit type', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Loss count threshold', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  UnitHire: {
    type: 'UnitHire',
    label: 'Unit Hired',
    description: 'Fires when a unit type is recruited/hired. Set counter to require N hires.',
    params: [
      { label: 'Unit type', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
    ],
    extraFields: {
      counter: { label: 'Hire count threshold', hint: 'e.g. 1', required: false, type: 'number' },
    },
  },
  ObjectInteractionBefore: {
    type: 'ObjectInteractionBefore',
    label: 'Object Interaction (Before)',
    description: 'Fires before the player interacts with a map object or zone.',
    params: [
      { label: 'Entity ID', hint: 'e.g. amplifier', required: true, entity: 'mapObject' },
    ],
  },
  ObjectInteractionAfter: {
    type: 'ObjectInteractionAfter',
    label: 'Object Interaction (After)',
    description: 'Fires after the player interacts with a map object or zone.',
    params: [
      { label: 'Entity ID', hint: 'e.g. dragon_utopia', required: true, entity: 'mapObject' },
    ],
  },
  ResCounter: {
    type: 'ResCounter',
    label: 'Resource Check',
    description: "Checks the player's resource stockpile against a value.",
    params: [
      { label: 'Resource', hint: 'wood', required: true, type: 'enum', options: ['gold', 'wood', 'ore', 'crystals', 'mercury', 'gemstones', 'dust'] },
      { label: 'Operator', hint: '>=', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<=', '!='] },
      { label: 'Value', hint: 'e.g. 20', required: true, type: 'number' },
    ],
  },
  ObjectCaptureEntity: {
    type: 'ObjectCaptureEntity',
    label: 'Object Captured',
    description: 'Fires when the player captures a specific map entity (mine, city, etc.).',
    params: [
      { label: 'Entity ID', hint: 'e.g. mine1', required: true, entity: 'mapObject' },
    ],
  },
  ItemOwnSide: {
    type: 'ItemOwnSide',
    label: 'Item Owned (Side)',
    description: "Checks whether the player's side owns a specific artifact/item.",
    params: [
      { label: 'Item ID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<=', '!='] },
      { label: 'Value', hint: 'e.g. 0', required: true, type: 'number' },
    ],
  },
  PlayerDefeated: {
    type: 'PlayerDefeated',
    label: 'Player Defeated',
    description: 'Fires when a specific player is defeated.',
    params: [
      { label: 'Player index', hint: '0, 1, 2 or 3', required: true, type: 'enum', options: ['0', '1', '2', '3'] },
    ],
  },
}

export const CONDITION_LIST: ConditionDef[] = Object.values(CONDITION_REGISTRY)
