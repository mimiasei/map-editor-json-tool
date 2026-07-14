// ─── Action registry ────────────────────────────────────────────────────────────
// Defines all known action types, their labels, descriptions, and parameters.
// The tool supports custom/unknown types — users can type any string as the type.

import type { ParamDef } from './conditions'

export interface ActionDef {
  type: string
  label: string
  description: string
  category: string
  params: ParamDef[]
}

export const ACTION_REGISTRY: Record<string, ActionDef> = {
  // ── Game Flow ──────────────────────────────────────────────────────────────
  GameVictory: {
    type: 'GameVictory',
    label: 'Game Victory',
    category: 'Game Flow',
    description: 'Triggers the victory screen for the player.',
    params: [],
  },
  GameLose: {
    type: 'GameLose',
    label: 'Game Defeat',
    category: 'Game Flow',
    description: 'Triggers the defeat screen for the player.',
    params: [],
  },
  Dialog: {
    type: 'Dialog',
    label: 'Show Dialog',
    category: 'Game Flow',
    description: 'Shows a story dialog using the given localization key.',
    params: [
      { label: 'Dialog key', hint: 'e.g. som_main_quest_line_start', required: true },
    ],
  },
  Print: {
    type: 'Print',
    label: 'Print Message',
    category: 'Game Flow',
    description: 'Prints a debug/achievement message.',
    params: [
      { label: 'Message', hint: 'e.g. achievement_key', required: true },
    ],
  },

  // ── Quest Management ───────────────────────────────────────────────────────
  CurrentSubQuestDone: {
    type: 'CurrentSubQuestDone',
    label: 'Complete Current Subquest',
    category: 'Quest Management',
    description: 'Marks the current subquest as complete.',
    params: [],
  },
  SubQuestActivate: {
    type: 'SubQuestActivate',
    label: 'Activate Subquest',
    category: 'Quest Management',
    description: 'Activates a specific subquest on a quest.',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest ID', hint: 'e.g. 2', required: true, ref: 'subquest' },
    ],
  },
  SubQuestDeactivate: {
    type: 'SubQuestDeactivate',
    label: 'Deactivate Subquest',
    category: 'Quest Management',
    description: 'Deactivates a specific subquest on a quest.',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest ID', hint: 'e.g. 2', required: true, ref: 'subquest' },
    ],
  },
  NextQuest: {
    type: 'NextQuest',
    label: 'Advance to Next Quest',
    category: 'Quest Management',
    description: 'Advances to the next quest (activates it).',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
    ],
  },
  EndQuest: {
    type: 'EndQuest',
    label: 'End Quest',
    category: 'Quest Management',
    description: 'Ends/closes the specified quest.',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
    ],
  },

  // ── Counter Manipulation ───────────────────────────────────────────────────
  CounterPlus: {
    type: 'CounterPlus',
    label: 'Increment Counter',
    category: 'Counter',
    description: 'Increments a counter by the given amount.',
    params: [
      { label: 'Counter ID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CounterSetRandom: {
    type: 'CounterSetRandom',
    label: 'Set Counter Random',
    category: 'Counter',
    description: 'Sets a counter to a random integer between min and max (inclusive).',
    params: [
      { label: 'Counter ID', hint: 'e.g. random_event', required: true, ref: 'counter' },
      { label: 'Min', hint: 'e.g. 1', required: true, type: 'number' },
      { label: 'Max', hint: 'e.g. 3', required: true, type: 'number' },
    ],
  },

  // ── Hero Manipulation ──────────────────────────────────────────────────────
  GiveUnitHero: {
    type: 'GiveUnitHero',
    label: 'Give Units to Hero',
    category: 'Hero',
    description: "Adds units to a hero's army.",
    params: [
      { label: 'Unit ID', hint: 'e.g. hive_queen', required: true, entity: 'creature' },
      { label: 'Count', hint: 'e.g. 5', required: true, type: 'number' },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveUnitHeroPerWeek: {
    type: 'GiveUnitHeroPerWeek',
    label: 'Give Units to Hero Per Week',
    category: 'Hero',
    description: "Adds units to a hero's army each week (repeating).",
    params: [
      { label: 'Unit ID', hint: 'e.g. jaw', required: true, entity: 'creature' },
      { label: 'Count', hint: 'e.g. 3', required: true, type: 'number' },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  RemoveUnitHero: {
    type: 'RemoveUnitHero',
    label: 'Remove Units from Hero',
    category: 'Hero',
    description: "Removes units from a hero's army. Use 'all' to remove all of that type.",
    params: [
      { label: 'Unit ID', hint: 'e.g. hive_queen', required: true, entity: 'creature' },
      { label: 'Count', hint: '"all" or a number', required: true },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveStatsHero: {
    type: 'GiveStatsHero',
    label: 'Give Stats to Hero',
    category: 'Hero',
    description: 'Adds stat points to a hero.',
    params: [
      {
        label: 'Stat name',
        hint: 'offence',
        required: true,
        type: 'enum',
        options: ['offence', 'defence', 'spellPower', 'intelligence', 'movementBonus', 'moral'],
      },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Amount', hint: 'e.g. 2', required: true, type: 'number' },
    ],
  },
  GiveExpHero: {
    type: 'GiveExpHero',
    label: 'Give Experience to Hero',
    category: 'Hero',
    description: 'Gives experience points to a hero. Hero ID is optional (defaults to player hero).',
    params: [
      { label: 'Amount', hint: 'e.g. 1000', required: true, type: 'number' },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6 (optional)', required: false, entity: 'hero' },
    ],
  },
  GiveItemHero: {
    type: 'GiveItemHero',
    label: 'Give Item to Hero',
    category: 'Hero',
    description: 'Gives an artifact/item to a hero.',
    params: [
      { label: 'Item ID', hint: 'e.g. catechism_of_night_magic_artifact', required: true, entity: 'artifact' },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  AddSkillHero: {
    type: 'AddSkillHero',
    label: 'Add Skill to Hero',
    category: 'Hero',
    description: 'Adds a skill level to a hero. Call multiple times to add multiple levels.',
    params: [
      { label: 'Skill ID', hint: 'e.g. skill_faction_demons', required: true, entity: 'skill' as const },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  AddSpellHero: {
    type: 'AddSpellHero',
    label: 'Teach Spell to Hero',
    category: 'Hero',
    description: 'Teaches a spell to a hero.',
    params: [
      { label: 'Spell ID', hint: 'e.g. day_1_magic_healing_water', required: true, entity: 'spell' as const },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  AddBuffHeroDays: {
    type: 'AddBuffHeroDays',
    label: 'Apply Buff to Hero',
    category: 'Hero',
    description: 'Applies a buff to a hero for N days. Use -1 for permanent.',
    params: [
      { label: 'Buff ID', hint: 'e.g. campaign_infinite_moves_buff', required: true, entity: 'buff' as const },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Days', hint: '-1 for permanent', required: false, type: 'number' },
    ],
  },
  HeroResetMovePointsMax: {
    type: 'HeroResetMovePointsMax',
    label: 'Reset Hero Movement',
    category: 'Hero',
    description: "Resets a hero's movement points to maximum.",
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  SpawnHero: {
    type: 'SpawnHero',
    label: 'Spawn Hero',
    category: 'Hero',
    description: 'Spawns a hero at the given map node for the given player.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node ID', hint: 'e.g. 47', required: true },
      { label: 'Player', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  DeleteHero: {
    type: 'DeleteHero',
    label: 'Delete Hero',
    category: 'Hero',
    description: 'Removes a hero from the map permanently.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  DisableAiHero: {
    type: 'DisableAiHero',
    label: 'Disable AI Hero',
    category: 'Hero',
    description: 'Disables AI control for a hero.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  TeleportHero: {
    type: 'TeleportHero',
    label: 'Teleport Hero',
    category: 'Hero',
    description: 'Teleports a hero to a map node.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node ID', hint: 'e.g. 47', required: true },
    ],
  },
  HeroToNode: {
    type: 'HeroToNode',
    label: 'Move Hero to Node',
    category: 'Hero',
    description: 'Moves a hero to a map node.',
    params: [
      { label: 'Hero ID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node ID', hint: 'e.g. 47', required: true },
    ],
  },

  // ── Map / Camera ───────────────────────────────────────────────────────────
  MoveCamera: {
    type: 'MoveCamera',
    label: 'Move Camera',
    category: 'Map / Camera',
    description: 'Moves the camera to focus on a map node.',
    params: [
      { label: 'Node ID', hint: 'e.g. 47', required: true },
    ],
  },
  RevealFogOfWar: {
    type: 'RevealFogOfWar',
    label: 'Reveal Fog of War',
    category: 'Map / Camera',
    description: 'Reveals fog of war around a node with the given radius.',
    params: [
      { label: 'Node ID', hint: 'e.g. 47', required: true },
      { label: 'Radius', hint: 'e.g. 5', required: true, type: 'number' },
    ],
  },

  // ── Squad / Neutral ────────────────────────────────────────────────────────
  IncreaseStrengthSquad: {
    type: 'IncreaseStrengthSquad',
    label: 'Increase Squad Strength',
    category: 'Squad',
    description: 'Upgrades a neutral squad. Format "tier,level" e.g. "0,2" = upgrade by 2 levels.',
    params: [
      { label: 'Squad ID', hint: 'e.g. E_Squad', required: true },
      { label: 'Upgrade (tier,level)', hint: 'e.g. 0,2', required: true },
    ],
  },

  // ── Trigger Management ─────────────────────────────────────────────────────
  TriggerClearCustom: {
    type: 'TriggerClearCustom',
    label: 'Clear Trigger',
    category: 'Trigger',
    description: 'Clears/resets a specific trigger in a quest. Indices are 0-based.',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest index', hint: '0-based, e.g. 0', required: true, type: 'number' },
      { label: 'Trigger index', hint: '0-based, e.g. 0', required: true, type: 'number' },
      { label: 'Flag', hint: '0 or 1', required: true, type: 'enum', options: ['0', '1'] },
    ],
  },

  // ── Counter Manipulation (additional) ─────────────────────────────────────
  CounterSet: {
    type: 'CounterSet',
    label: 'Set Counter',
    category: 'Counter',
    description: 'Sets a counter to a specific value.',
    params: [
      { label: 'Counter ID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CounterMinus: {
    type: 'CounterMinus',
    label: 'Decrement Counter',
    category: 'Counter',
    description: 'Decrements a counter by the given amount.',
    params: [
      { label: 'Counter ID', hint: 'e.g. gold_mines_owned', required: true, ref: 'counter' },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },

  // ── Quest Management (additional) ─────────────────────────────────────────
  NextSubQuest: {
    type: 'NextSubQuest',
    label: 'Advance to Next Subquest',
    category: 'Quest Management',
    description: 'Activates the next subquest by SID or numeric index.',
    params: [
      { label: 'Subquest SID or index', hint: 'e.g. daughter_quest_line_2 or 2', required: true, ref: 'subquest' },
    ],
  },
  SubQuestDone: {
    type: 'SubQuestDone',
    label: 'Mark Subquest Done',
    category: 'Quest Management',
    description: 'Marks a specific subquest as done from outside its own quest.',
    params: [
      { label: 'Quest ID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
    ],
  },
  NextAfterGroup: {
    type: 'NextAfterGroup',
    label: 'Next After Group',
    category: 'Quest Management',
    description: 'Activates the next subquest after all subquests in a group are done.',
    params: [
      { label: 'Group SID', hint: 'e.g. SideQuest1_group1', required: true, ref: 'subquest' },
      { label: 'Next subquest SID', hint: 'e.g. SideQuest1_3', required: true, ref: 'subquest' },
    ],
  },

  // ── Hero Manipulation (additional) ────────────────────────────────────────
  ChangeManaHero: {
    type: 'ChangeManaHero',
    label: 'Set Hero Mana',
    category: 'Hero',
    description: "Sets a hero's mana to the given value.",
    params: [
      { label: 'Hero ID', hint: 'e.g. nature_hero_6', required: true, entity: 'hero' },
      { label: 'Mana amount', hint: 'e.g. 130', required: true, type: 'number' },
    ],
  },
  ResurrectHero: {
    type: 'ResurrectHero',
    label: 'Resurrect Hero',
    category: 'Hero',
    description: 'Resurrects a defeated hero at a map node.',
    params: [
      { label: 'Hero ID', hint: 'e.g. nature_hero_6', required: true, entity: 'hero' },
      { label: 'Node ID', hint: 'e.g. 234', required: true },
      { label: 'Flag', hint: '0', required: false },
    ],
  },
  RemoveBuffHero: {
    type: 'RemoveBuffHero',
    label: 'Remove Buff from Hero',
    category: 'Hero',
    description: "Removes a buff from a hero. Leave Hero ID empty to remove from all heroes.",
    params: [
      { label: 'Buff ID', hint: 'e.g. cm_fun_necromancy_power_disabled', required: true, entity: 'buff' as const },
      { label: 'Hero ID', hint: 'e.g. demon_hero_6 (or leave blank)', required: false, entity: 'hero' },
    ],
  },
  HeroToHero: {
    type: 'HeroToHero',
    label: 'Move Hero Toward Hero',
    category: 'Hero',
    description: 'Moves one hero toward another hero on the map.',
    params: [
      { label: 'Moving hero ID', hint: 'e.g. cm_fun_hero_human_1', required: true, entity: 'hero' },
      { label: 'Target hero ID', hint: 'e.g. cm_fun_hero_1', required: true, entity: 'hero' },
    ],
  },
  SetHeroMovePoints: {
    type: 'SetHeroMovePoints',
    label: 'Set Hero Move Points',
    category: 'Hero',
    description: "Sets a hero's movement points to the given value.",
    params: [
      { label: 'Hero ID', hint: 'e.g. cm_fun_hero_human_1', required: true, entity: 'hero' },
      { label: 'Move points', hint: 'e.g. 9999', required: true, type: 'number' },
    ],
  },
  HeroStop: {
    type: 'HeroStop',
    label: 'Stop Hero Movement',
    category: 'Hero',
    description: "Stops the hero's current movement path (used before cutscenes).",
    params: [],
  },

  // ── Resources ──────────────────────────────────────────────────────────────
  GiveRes: {
    type: 'GiveRes',
    label: 'Give Resources',
    category: 'Resources',
    description: 'Gives the player a specified amount of a resource.',
    params: [
      { label: 'Resource', hint: 'gold', required: true, type: 'enum', options: ['gold', 'wood', 'ore', 'crystals', 'mercury', 'gemstones', 'dust'] },
      { label: 'Amount', hint: 'e.g. 500', required: true, type: 'number' },
    ],
  },
  RemoveRes: {
    type: 'RemoveRes',
    label: 'Remove Resources',
    category: 'Resources',
    description: "Removes a specified amount of a resource from the player's stockpile.",
    params: [
      { label: 'Resource', hint: 'gold', required: true, type: 'enum', options: ['gold', 'wood', 'ore', 'crystals', 'mercury', 'gemstones', 'dust'] },
      { label: 'Amount', hint: 'e.g. 50', required: true, type: 'number' },
    ],
  },

  // ── Game Flow (additional) ─────────────────────────────────────────────────
  ChangeCampaignOneStep: {
    type: 'ChangeCampaignOneStep',
    label: 'Advance Campaign',
    category: 'Game Flow',
    description: 'Advances the campaign by one step.',
    params: [
      { label: 'Value', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  EnableInterruption: {
    type: 'EnableInterruption',
    label: 'Enable Interruption',
    category: 'Game Flow',
    description: 'Enables (activates) the specified interruption by SID.',
    params: [
      { label: 'Interruption SID', hint: 'e.g. interaction_with_human_hero_16', required: true, ref: 'interruption' },
    ],
  },
  DisableInterruption: {
    type: 'DisableInterruption',
    label: 'Disable Interruption',
    category: 'Game Flow',
    description: 'Disables (deactivates) the specified interruption by SID.',
    params: [
      { label: 'Interruption SID', hint: 'e.g. interaction_with_human_hero_16', required: true, ref: 'interruption' },
    ],
  },
  RandomDialog: {
    type: 'RandomDialog',
    label: 'Random Dialog',
    category: 'Game Flow',
    description: 'Plays a randomly chosen dialog from the given list of keys. Add up to 5 options.',
    params: [
      { label: 'Dialog key 1', hint: 'e.g. god_fog_fight1', required: true },
      { label: 'Dialog key 2', hint: 'optional', required: false },
      { label: 'Dialog key 3', hint: 'optional', required: false },
      { label: 'Dialog key 4', hint: 'optional', required: false },
      { label: 'Dialog key 5', hint: 'optional', required: false },
    ],
  },

  // ── Entity / Objects ───────────────────────────────────────────────────────
  DeleteEntity: {
    type: 'DeleteEntity',
    label: 'Delete Entity',
    category: 'Entity',
    description: 'Removes a map entity (blocking object, zone, decoration, etc.) permanently.',
    params: [
      { label: 'Entity ID', hint: 'e.g. block_1_1', required: true },
    ],
  },
  SpawnMapObject: {
    type: 'SpawnMapObject',
    label: 'Spawn Map Object',
    category: 'Entity',
    description: 'Spawns a map decoration/object at the given node.',
    params: [
      { label: 'Object type', hint: 'e.g. hill_dead_big', required: true },
      { label: 'Node ID', hint: 'e.g. 1986', required: true },
      { label: 'Flag', hint: '0', required: false },
    ],
  },
  SpawnObject: {
    type: 'SpawnObject',
    label: 'Spawn Interactable Object',
    category: 'Entity',
    description: 'Spawns an interactable object at a node and assigns it an entity SID.',
    params: [
      { label: 'Object type', hint: 'e.g. campaign_lost_library_empty', required: true, entity: 'mapObject' },
      { label: 'Node ID', hint: 'e.g. 1755', required: true },
      { label: 'Flag', hint: 'false', required: false, type: 'enum', options: ['false', 'true'] },
      { label: 'Entity SID', hint: 'e.g. diary', required: false },
    ],
  },
  SetActivePortal: {
    type: 'SetActivePortal',
    label: 'Set Portal Active',
    category: 'Entity',
    description: 'Enables or disables a portal entity.',
    params: [
      { label: 'Portal entity ID', hint: 'e.g. portal_in', required: true, entity: 'mapObject' },
      { label: 'Active', hint: 'true or false', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  EntityActionsOff: {
    type: 'EntityActionsOff',
    label: 'Disable Entity Actions',
    category: 'Entity',
    description: 'Disables all actions on a map entity (makes it non-interactable).',
    params: [
      { label: 'Entity ID', hint: 'e.g. cirque', required: true, entity: 'mapObject' },
    ],
  },

  // ── Markers / VFX ─────────────────────────────────────────────────────────
  SetQuestMarker: {
    type: 'SetQuestMarker',
    label: 'Set Quest Marker',
    category: 'Markers / VFX',
    description: 'Attaches a quest marker VFX to a map entity.',
    params: [
      { label: 'Entity ID', hint: 'e.g. cavalryman', required: true, entity: 'mapObject' },
      { label: 'Marker path', hint: 'e.g. effects/global_map/quest_mark_silver_01', required: true },
    ],
  },
  SetActiveQuestMarker: {
    type: 'SetActiveQuestMarker',
    label: 'Show/Hide Quest Marker',
    category: 'Markers / VFX',
    description: 'Shows or hides a quest marker already attached to an entity.',
    params: [
      { label: 'Entity ID', hint: 'e.g. dragon_utopia', required: true, entity: 'mapObject' },
      { label: 'Active', hint: 'true or false', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  CreateVFX: {
    type: 'CreateVFX',
    label: 'Create VFX',
    category: 'Markers / VFX',
    description: 'Creates a VFX effect at a node and assigns it an entity SID.',
    params: [
      { label: 'VFX type', hint: 'e.g. fx_2x2_quest_mark_silver_01', required: true },
      { label: 'Node ID', hint: 'e.g. 2398', required: true },
      { label: 'Flag 1', hint: 'false', required: false, type: 'enum', options: ['false', 'true'] },
      { label: 'Flag 2', hint: 'true', required: false, type: 'enum', options: ['true', 'false'] },
      { label: 'Entity SID', hint: 'e.g. qm_construction_site', required: false },
    ],
  },
  SetActiveVFX: {
    type: 'SetActiveVFX',
    label: 'Show/Hide VFX',
    category: 'Markers / VFX',
    description: 'Shows or hides a VFX entity.',
    params: [
      { label: 'VFX entity SID', hint: 'e.g. pm_west_road', required: true },
      { label: 'Active', hint: 'true or false', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  SetActiveMarker: {
    type: 'SetActiveMarker',
    label: 'Show/Hide Zone Marker',
    category: 'Markers / VFX',
    description: 'Shows or hides a zone/interaction marker.',
    params: [
      { label: 'Zone/marker entity ID', hint: 'e.g. zone_found_river_source', required: true, entity: 'mapObject' },
      { label: 'Active', hint: 'true or false', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },

  // ── Squad / Neutral (additional) ──────────────────────────────────────────
  DeleteSquad: {
    type: 'DeleteSquad',
    label: 'Delete Squad',
    category: 'Squad',
    description: 'Removes a neutral squad/stack from the map.',
    params: [
      { label: 'Squad entity ID', hint: 'e.g. blocking_squad1', required: true },
      { label: 'Flag', hint: '1', required: false },
    ],
  },

  // ── AI ─────────────────────────────────────────────────────────────────────
  AiBanArea: {
    type: 'AiBanArea',
    label: 'AI Ban Area',
    category: 'AI',
    description: 'Prohibits AI heroes from entering the area around a node.',
    params: [
      { label: 'Node ID', hint: 'e.g. 1816', required: true },
    ],
  },
  AiUnbanArea: {
    type: 'AiUnbanArea',
    label: 'AI Unban Area',
    category: 'AI',
    description: 'Lifts an AI movement prohibition from the area around a node.',
    params: [
      { label: 'Node ID', hint: 'e.g. 1816', required: true },
    ],
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTION_REGISTRY)

export const ACTION_CATEGORIES: string[] = [
  ...new Set(ACTION_LIST.map((a) => a.category)),
]
