// ─── Action registry ────────────────────────────────────────────────────────────
// Defines all known action types, their labels, descriptions, and parameters.
// Source: https://unfrozen.notion.site/Actions-and-their-parameters-Full-list-...
// The tool supports custom/unknown types — users can type any string as the type.
//
// NOTE: Dialog actions support an optional "break" param (string literal "break"
// appended to the p array). When present, after the dialog ends ALL further game
// logic in the queue is interrupted. See param definitions on each dialog action.

import type { ParamDef } from './conditions'

export interface ActionDef {
  type: string
  label: string
  description: string
  category: string
  params: ParamDef[]
}

export const ACTION_REGISTRY: Record<string, ActionDef> = {

  // ── Quest Management ───────────────────────────────────────────────────────

  NextQuest: {
    type: 'NextQuest',
    label: 'Next Quest',
    category: 'Quest Management',
    description: 'Disables the current quest and activates the quest with the specified SID. Leave SID blank to simply disable the current quest. Only one new quest can be enabled at a time.',
    params: [
      { label: 'Quest SID', hint: 'Leave blank to just end current', required: false, ref: 'quest' },
    ],
  },
  EndQuest: {
    type: 'EndQuest',
    label: 'End Quest(s)',
    category: 'Quest Management',
    description: 'Disables ALL quests with the specified SIDs.',
    params: [
      { label: 'Quest SID 1', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Quest SID 2', hint: 'optional', required: false, ref: 'quest' },
      { label: 'Quest SID 3', hint: 'optional', required: false, ref: 'quest' },
    ],
  },
  NextSubQuest: {
    type: 'NextSubQuest',
    label: 'Next Subquest(s)',
    category: 'Quest Management',
    description: 'Disables ALL subquests of the current quest and activates ALL subquests with the specified SIDs.',
    params: [
      { label: 'Subquest SID 1', hint: 'e.g. daughter_quest_line_2', required: true, ref: 'subquest' },
      { label: 'Subquest SID 2', hint: 'optional', required: false, ref: 'subquest' },
      { label: 'Subquest SID 3', hint: 'optional', required: false, ref: 'subquest' },
    ],
  },
  SubQuestActivate: {
    type: 'SubQuestActivate',
    label: 'Activate Subquest',
    category: 'Quest Management',
    description: 'Activates a specific subquest on the specified quest.',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
    ],
  },
  SubQuestDeactivate: {
    type: 'SubQuestDeactivate',
    label: 'Deactivate Subquest',
    category: 'Quest Management',
    description: 'Deactivates a specific subquest on the specified quest.',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
    ],
  },
  CurrentSubQuestDone: {
    type: 'CurrentSubQuestDone',
    label: 'Grey Out Current Subquest',
    category: 'Quest Management',
    description: '"Greys out" the current subquest in the quest log (visually finished). The subquest remains active — this is purely visual.',
    params: [],
  },
  SubQuestDone: {
    type: 'SubQuestDone',
    label: 'Grey Out Subquest',
    category: 'Quest Management',
    description: '"Greys out" the specified subquest in the quest log (visually finished). The subquest remains active — this is purely visual.',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
    ],
  },
  NextAfterGroup: {
    type: 'NextAfterGroup',
    label: 'Next Subquest After Group',
    category: 'Quest Management',
    description: 'When ALL subquests in the specified group are completed, enables the specified subquest. Action with a precondition.',
    params: [
      { label: 'Group SID', hint: 'e.g. SideQuest1_group1', required: true, ref: 'subquest' },
      { label: 'Next subquest SID', hint: 'e.g. SideQuest1_3', required: true, ref: 'subquest' },
    ],
  },
  NextQuestAfterGroup: {
    type: 'NextQuestAfterGroup',
    label: 'Next Quest After Group',
    category: 'Quest Management',
    description: 'When ALL subquests in the specified group are completed, enables the specified quest. Action with a precondition.',
    params: [
      { label: 'Group SID', hint: 'e.g. SideQuest1_group1', required: true, ref: 'subquest' },
      { label: 'Next quest SID', hint: 'e.g. main_quest_line_2', required: true, ref: 'quest' },
    ],
  },
  NextSubGroupAfterGroup: {
    type: 'NextSubGroupAfterGroup',
    label: 'Next Subquest Group After Group',
    category: 'Quest Management',
    description: 'When ALL subquests in group 1 are completed, enables ALL subquests in group 2. Action with a precondition.',
    params: [
      { label: 'Completed group SID', hint: 'e.g. SideQuest1_group1', required: true, ref: 'subquest' },
      { label: 'Next group SID', hint: 'e.g. SideQuest1_group2', required: true, ref: 'subquest' },
    ],
  },

  // ── Re-Activating Conditions ───────────────────────────────────────────────

  TriggerClear: {
    type: 'TriggerClear',
    label: 'Clear All Trigger Conditions',
    category: 'Quest Management',
    description: 'Re-enables ALL conditions of the specified trigger (by 0-based index), making them "forget" they were triggered previously.',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
      { label: 'Trigger index', hint: '0-based', required: true, type: 'number' },
    ],
  },
  TriggerClearCustom: {
    type: 'TriggerClearCustom',
    label: 'Clear Single Trigger Condition',
    category: 'Quest Management',
    description: 'Re-enables a specific condition (by 0-based index) on a trigger, making it "forget" it was triggered. Used primarily to re-enable individual conditions in "And" combinations.',
    params: [
      { label: 'Quest SID', hint: 'e.g. main_quest_line', required: true, ref: 'quest' },
      { label: 'Subquest SID', hint: 'e.g. MainQuest1a_2', required: true, ref: 'subquest' },
      { label: 'Trigger index', hint: '0-based', required: true, type: 'number' },
      { label: 'Condition index', hint: '0-based', required: true, type: 'number' },
    ],
  },

  // ── Technical / Counters ───────────────────────────────────────────────────

  AutoSave: {
    type: 'AutoSave',
    label: 'Auto Save',
    category: 'Technical',
    description: 'Forces the game to create an autosave. NOTE: Actions immediately after AutoSave will not be saved. Overwrites last day\'s autosave.',
    params: [],
  },
  Print: {
    type: 'Print',
    label: 'Print to Log',
    category: 'Technical',
    description: 'Outputs text to the developer console/log. Debugging only — no in-game effect.',
    params: [
      { label: 'Message', hint: 'e.g. debug_message', required: true },
      { label: 'Message 2', hint: 'optional', required: false },
      { label: 'Message 3', hint: 'optional', required: false },
    ],
  },
  EnableInterruption: {
    type: 'EnableInterruption',
    label: 'Enable Interruption',
    category: 'Technical',
    description: 'Forces the specified disabled interruption to start triggering again.',
    params: [
      { label: 'Interruption SID', hint: 'e.g. interaction_with_human_hero_16', required: true, ref: 'interruption' },
    ],
  },
  DisableInterruption: {
    type: 'DisableInterruption',
    label: 'Disable Interruption',
    category: 'Technical',
    description: 'Forces the specified interruption to stop triggering (it still exists but won\'t fire).',
    params: [
      { label: 'Interruption SID', hint: 'e.g. interaction_with_human_hero_16', required: true, ref: 'interruption' },
    ],
  },
  BreakInterruptions: {
    type: 'BreakInterruptions',
    label: 'Break Interruptions',
    category: 'Technical',
    description: 'Stops the current interruption, allowing normal game flow to resume. Used exclusively in dialog mapActions to prevent battle when a hero should step back instead. Must be paired with StepBack.',
    params: [],
  },

  // ── Local Counters ─────────────────────────────────────────────────────────

  CounterPlus: {
    type: 'CounterPlus',
    label: 'Counter +',
    category: 'Counter',
    description: 'Increases the value of the local counter by the specified integer X.',
    params: [
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CounterMinus: {
    type: 'CounterMinus',
    label: 'Counter −',
    category: 'Counter',
    description: 'Decreases the value of the local counter by the specified integer X.',
    params: [
      { label: 'Counter SID', hint: 'e.g. gold_mines_owned', required: true, ref: 'counter' },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CounterSet: {
    type: 'CounterSet',
    label: 'Counter = (Set)',
    category: 'Counter',
    description: 'Overwrites the value of the local counter with the new specified integer X.',
    params: [
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CounterSetRandom: {
    type: 'CounterSetRandom',
    label: 'Counter = Random',
    category: 'Counter',
    description: 'Overwrites the value of the local counter with a random integer between XMin and XMax.',
    params: [
      { label: 'Counter SID', hint: 'e.g. random_event', required: true, ref: 'counter' },
      { label: 'Min', hint: 'e.g. 1', required: true, type: 'number' },
      { label: 'Max', hint: 'e.g. 3', required: true, type: 'number' },
    ],
  },

  // ── Campaign Counters ──────────────────────────────────────────────────────

  StoryCounterPlus: {
    type: 'StoryCounterPlus',
    label: 'Story Counter +',
    category: 'Counter',
    description: 'Increases the value of the campaign (story) counter by X. Campaign-only. When inside a dialog, write to "actions" block, not "mapActions".',
    params: [
      { label: 'Story Counter SID', hint: 'e.g. campaign_stage', required: true },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  StoryCounterMinus: {
    type: 'StoryCounterMinus',
    label: 'Story Counter −',
    category: 'Counter',
    description: 'Decreases the value of the campaign (story) counter by X. Campaign-only. When inside a dialog, write to "actions" block, not "mapActions".',
    params: [
      { label: 'Story Counter SID', hint: 'e.g. campaign_stage', required: true },
      { label: 'Amount', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  StoryCounterSet: {
    type: 'StoryCounterSet',
    label: 'Story Counter = (Set)',
    category: 'Counter',
    description: 'Overwrites the value of the campaign (story) counter with X. Campaign-only. When inside a dialog, write to "actions" block, not "mapActions".',
    params: [
      { label: 'Story Counter SID', hint: 'e.g. campaign_stage', required: true },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },

  // ── Dialogs ────────────────────────────────────────────────────────────────
  // All dialog actions support an optional "break" as the last param string.
  // When "break" is present, after the dialog ends all further queued logic is interrupted.

  Dialog: {
    type: 'Dialog',
    label: 'Show Dialog',
    category: 'Dialogs',
    description: 'Calls the dialog with the specified SID. Add "break" as the last param to interrupt all further game logic after the dialog ends.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. som_main_quest_line_start', required: true },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogIfHero: {
    type: 'DialogIfHero',
    label: 'Show Dialog If Hero',
    category: 'Dialogs',
    description: 'If the currently selected hero has the specified SID, calls the dialog. Precondition action.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. hero_dialog', required: true },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogIfRes: {
    type: 'DialogIfRes',
    label: 'Show Dialog If Resource',
    category: 'Dialogs',
    description: 'If the player\'s resource satisfies the inequality, calls the dialog. Precondition action.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. gold_dialog', required: true },
      {
        label: 'Resource',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 100', required: true, type: 'number' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogIfCounter: {
    type: 'DialogIfCounter',
    label: 'Show Dialog If Counter',
    category: 'Dialogs',
    description: 'If the local counter satisfies the inequality, calls the dialog. Precondition action. Works only with local counters.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. stage_dialog', required: true },
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogIfItem: {
    type: 'DialogIfItem',
    label: 'Show Dialog If Item',
    category: 'Dialogs',
    description: 'If the currently selected hero has the item in their inventory/backpack, calls the dialog. Precondition action.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. artifact_dialog', required: true },
      { label: 'Item SID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  RandomDialog: {
    type: 'RandomDialog',
    label: 'Random Dialog',
    category: 'Dialogs',
    description: 'Calls one random dialog from the specified list. NOTE: "break" cannot be added to RandomDialog.',
    params: [
      { label: 'Dialog SID 1', hint: 'e.g. god_fog_fight1', required: true },
      { label: 'Dialog SID 2', hint: 'optional', required: false },
      { label: 'Dialog SID 3', hint: 'optional', required: false },
      { label: 'Dialog SID 4', hint: 'optional', required: false },
      { label: 'Dialog SID 5', hint: 'optional', required: false },
    ],
  },

  // ── One-Time Dialogs ───────────────────────────────────────────────────────

  DialogOne: {
    type: 'DialogOne',
    label: 'Show Dialog (Once)',
    category: 'Dialogs',
    description: 'A Dialog action that triggers only once for the rest of the match.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. som_main_quest_line_start', required: true },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogOneIfHero: {
    type: 'DialogOneIfHero',
    label: 'Show Dialog If Hero (Once)',
    category: 'Dialogs',
    description: 'A DialogIfHero action that triggers only once for the rest of the match.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. hero_dialog', required: true },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogOneIfRes: {
    type: 'DialogOneIfRes',
    label: 'Show Dialog If Resource (Once)',
    category: 'Dialogs',
    description: 'A DialogIfRes action that triggers only once for the rest of the match.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. gold_dialog', required: true },
      {
        label: 'Resource',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 100', required: true, type: 'number' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },
  DialogOneIfCounter: {
    type: 'DialogOneIfCounter',
    label: 'Show Dialog If Counter (Once)',
    category: 'Dialogs',
    description: 'A DialogIfCounter action that triggers only once for the rest of the match.',
    params: [
      { label: 'Dialog SID', hint: 'e.g. stage_dialog', required: true },
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
      { label: '"break" flag', hint: 'Type "break" to stop subsequent logic', required: false },
    ],
  },

  // ── Other UIs ──────────────────────────────────────────────────────────────

  ShowFloatingUI: {
    type: 'ShowFloatingUI',
    label: 'Show Floating UI',
    category: 'UI',
    description: 'Displays a floating/fading icon with text above the currently selected hero. Used for faction reputation changes. Possible icons: dungeon_icon, human_icon, undead_icon, spring_icon, unfrozen_icon, hive_icon.',
    params: [
      {
        label: 'Icon SID',
        hint: 'e.g. dungeon_icon',
        required: true,
        type: 'enum',
        options: ['dungeon_icon', 'human_icon', 'undead_icon', 'spring_icon', 'unfrozen_icon', 'hive_icon'],
      },
      { label: 'Text string', hint: 'e.g. +reputation', required: true },
    ],
  },
  OpenUI: {
    type: 'OpenUI',
    label: 'Open UI',
    category: 'UI',
    description: 'Forcibly opens the specified interface. Possible values: LevelUp, HeroUI, HeroWithHero, MagicBook, MagicBookBattle.',
    params: [
      {
        label: 'UI SID',
        hint: 'e.g. LevelUp',
        required: true,
        type: 'enum',
        options: ['LevelUp', 'HeroUI', 'HeroWithHero', 'MagicBook', 'MagicBookBattle'],
      },
    ],
  },
  Guide: {
    type: 'Guide',
    label: 'Open Tutorial Guide',
    category: 'UI',
    description: 'Opens a tutorial window (block of slides) with the specified SID. When inside a dialog, write to "actions" block, not "mapActions".',
    params: [
      { label: 'Guide SID', hint: 'e.g. tutorial_guide_movement', required: true },
    ],
  },

  // ── Game Rules ─────────────────────────────────────────────────────────────

  GameVictory: {
    type: 'GameVictory',
    label: 'Player Victory',
    category: 'Game Rules',
    description: 'Forces the interacting player to win. In quest script, acts on the player under the specified "sharing" type.',
    params: [],
  },
  GameLose: {
    type: 'GameLose',
    label: 'Player Defeat',
    category: 'Game Rules',
    description: 'Forces the interacting player to lose. In quest script, acts on the player under the specified "sharing" type.',
    params: [],
  },
  SideLose: {
    type: 'SideLose',
    label: 'Force Player Defeat',
    category: 'Game Rules',
    description: 'Forces the player with the specified index to lose (defeat message shown, all heroes removed, all objects go neutral).',
    params: [
      { label: 'Player index', hint: '0=Player1, 1=Player2, etc.', required: true, type: 'enum', options: ['0', '1', '2', '3'] },
    ],
  },
  ChangeCampaignOneStep: {
    type: 'ChangeCampaignOneStep',
    label: 'Toggle Single-Turn Mode',
    category: 'Game Rules',
    description: 'Enables or disables single-turn mode. When enabled: heroes get unlimited movement, skipping turns is blocked.',
    params: [
      { label: 'Enable?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  AddGlobalBuff: {
    type: 'AddGlobalBuff',
    label: 'Add Global Buff',
    category: 'Game Rules',
    description: 'Applies a global effect with the specified SID. durationType: Infinite, UntilNextWeek, UntilNextDay, UntilNextBattle, ForSeveralDays, ForSeveralBattles. X is optional (used for ForSeveralDays/Battles).',
    params: [
      { label: 'Buff SID', hint: 'e.g. global_buff_sid', required: true },
      {
        label: 'Duration type',
        hint: 'Infinite',
        required: true,
        type: 'enum',
        options: ['Infinite', 'UntilNextWeek', 'UntilNextDay', 'UntilNextBattle', 'ForSeveralDays', 'ForSeveralBattles'],
      },
      { label: 'X (count)', hint: 'Required for ForSeveralDays/Battles', required: false, type: 'number' },
    ],
  },
  RemoveGlobalBuff: {
    type: 'RemoveGlobalBuff',
    label: 'Remove Global Buff',
    category: 'Game Rules',
    description: 'Disables the global effect with the specified SID. To re-enable it, use AddGlobalBuff again.',
    params: [
      { label: 'Buff SID', hint: 'e.g. global_buff_sid', required: true },
    ],
  },

  // ── Camera / Fog of War ────────────────────────────────────────────────────

  MoveCamera: {
    type: 'MoveCamera',
    label: 'Move Camera',
    category: 'Camera',
    description: 'Moves the camera center of the given player to the node/cell with the specified index.',
    params: [
      { label: 'Node index', hint: 'e.g. 47 (hover cell in editor)', required: true },
    ],
  },
  MoveCameraToSelectHero: {
    type: 'MoveCameraToSelectHero',
    label: 'Move Camera to Selected Hero',
    category: 'Camera',
    description: 'Moves the camera center to the cell where the currently selected hero is located.',
    params: [],
  },
  RevealFogOfWar: {
    type: 'RevealFogOfWar',
    label: 'Reveal Fog of War',
    category: 'Camera',
    description: 'Reveals fog of war within a radius of X around the node. X=1 reveals the cell and all adjacent cells. X=0 reveals nothing.',
    params: [
      { label: 'Node index', hint: 'e.g. 47', required: true },
      { label: 'Radius', hint: 'e.g. 5', required: true, type: 'number' },
    ],
  },
  CreateFogOfWar: {
    type: 'CreateFogOfWar',
    label: 'Create Fog of War',
    category: 'Camera',
    description: 'Creates fog of war within a radius of X around the node. Cannot create fog in the visibility range of a hero/castle/object with an owner.',
    params: [
      { label: 'Node index', hint: 'e.g. 47', required: true },
      { label: 'Radius', hint: 'e.g. 5', required: true, type: 'number' },
    ],
  },

  // ── Economy / Resources ────────────────────────────────────────────────────

  GiveRes: {
    type: 'GiveRes',
    label: 'Give Resources',
    category: 'Economy',
    description: 'Gives X units of the specified resource to the interacting player.',
    params: [
      {
        label: 'Resource',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
      { label: 'Amount', hint: 'e.g. 500', required: true, type: 'number' },
    ],
  },
  RemoveRes: {
    type: 'RemoveRes',
    label: 'Remove Resources',
    category: 'Economy',
    description: "Takes X units of the resource from the interacting player (minimum 0, can't go negative).",
    params: [
      {
        label: 'Resource',
        hint: 'gold',
        required: true,
        type: 'enum',
        options: ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones'],
      },
      { label: 'Amount', hint: 'e.g. 50', required: true, type: 'number' },
    ],
  },
  UnlockSpell: {
    type: 'UnlockSpell',
    label: 'Unlock Spell',
    category: 'Economy',
    description: 'Unlocks the spell with the specified SID in the player\'s magic observatory.',
    params: [
      { label: 'Spell SID', hint: 'e.g. day_1_magic_healing_water', required: true, entity: 'spell' as const },
    ],
  },
  UnlockBuildingCity: {
    type: 'UnlockBuildingCity',
    label: 'Unlock Building for Construction',
    category: 'Economy',
    description: 'Unlocks a previously restricted building for construction in the specified castle. Level: mage_guild 1–5, main building/walls 1–3, dwellings 1–2, others 1.',
    params: [
      { label: 'Building SID', hint: 'e.g. mage_guild', required: true },
      { label: 'Level', hint: '1–5', required: true, type: 'enum', options: ['1', '2', '3', '4', '5'] },
      { label: 'Castle entity', hint: 'e.g. city_1', required: true, mapEntity: true },
    ],
  },
  CreateBuildingCity: {
    type: 'CreateBuildingCity',
    label: 'Build Building in Castle',
    category: 'Economy',
    description: 'Creates (builds) the specified building at the specified level in the castle. Level: mage_guild 1–5, main building/walls 1–3, dwellings 1–2, others 1.',
    params: [
      { label: 'Building SID', hint: 'e.g. mage_guild', required: true },
      { label: 'Level', hint: '1–5', required: true, type: 'enum', options: ['1', '2', '3', '4', '5'] },
      { label: 'Castle entity', hint: 'e.g. city_1', required: true, mapEntity: true },
    ],
  },
  CaptureObject: {
    type: 'CaptureObject',
    label: 'Capture Object',
    category: 'Economy',
    description: 'Transfers the object with the specified entity under the control of the given player.',
    params: [
      { label: 'Object entity', hint: 'e.g. mine1', required: true, mapEntity: true },
    ],
  },
  LoseObject: {
    type: 'LoseObject',
    label: 'Make Object Neutral',
    category: 'Economy',
    description: 'Makes the object with the specified entity neutral (removes player ownership).',
    params: [
      { label: 'Object entity', hint: 'e.g. mine1', required: true, mapEntity: true },
    ],
  },

  // ── Map Objects ────────────────────────────────────────────────────────────

  SpawnObject: {
    type: 'SpawnObject',
    label: 'Spawn Interactive Object',
    category: 'Map Objects',
    description: 'Creates an interactive object at the specified node. boolMirror: true=mirror horizontally. entityObject is optional.',
    params: [
      { label: 'Object SID', hint: 'e.g. campaign_lost_library_empty', required: true, entity: 'mapObject' },
      { label: 'Node index', hint: 'e.g. 1755', required: true },
      { label: 'Mirror?', hint: 'false', required: false, type: 'enum', options: ['false', 'true'] },
      { label: 'Entity SID', hint: 'optional', required: false, mapEntity: true },
    ],
  },
  SpawnMapObject: {
    type: 'SpawnMapObject',
    label: 'Spawn Decoration Object',
    category: 'Map Objects',
    description: 'Creates a non-interactive decoration object at the specified node. Rotation: 0=0°, 1=90°, 2=180°, 3=270°. entityObject is optional.',
    params: [
      { label: 'Object SID', hint: 'e.g. hill_dead_big', required: true },
      { label: 'Node index', hint: 'e.g. 1986', required: true },
      { label: 'Rotation', hint: '0', required: false, type: 'enum', options: ['0', '1', '2', '3'] },
      { label: 'Entity SID', hint: 'optional', required: false, mapEntity: true },
    ],
  },
  CreateVFX: {
    type: 'CreateVFX',
    label: 'Create VFX',
    category: 'Map Objects',
    description: 'Creates a visual effect at the specified node. boolRotation: random rotation. isActive: show/hide. entityVFX is optional.',
    params: [
      { label: 'VFX SID', hint: 'e.g. fx_map_fire', required: true },
      { label: 'Node index', hint: 'e.g. 520', required: true },
      { label: 'Random rotation?', hint: 'false', required: false, type: 'enum', options: ['false', 'true'] },
      { label: 'Active?', hint: 'true', required: false, type: 'enum', options: ['true', 'false'] },
      { label: 'Entity SID', hint: 'optional', required: false, mapEntity: true },
    ],
  },
  EventBankRefresh: {
    type: 'EventBankRefresh',
    label: 'Recharge Bank',
    category: 'Map Objects',
    description: 'Recharges a building that was previously marked with the "Already visited" marker.',
    params: [
      { label: 'Object entity', hint: 'e.g. dragon_utopia_1', required: true, mapEntity: true },
    ],
  },
  SetActiveVFX: {
    type: 'SetActiveVFX',
    label: 'Show/Hide VFX',
    category: 'Map Objects',
    description: 'Enables or disables the visual effect with the specified entity. A disabled effect is fully hidden but still exists on the map.',
    params: [
      { label: 'VFX entity SID', hint: 'e.g. pm_west_road', required: true, mapEntity: true },
      { label: 'Active?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  SetQuestMarker: {
    type: 'SetQuestMarker',
    label: 'Set Quest Marker',
    category: 'Map Objects',
    description: 'Sets a quest marker on the object/squad with the specified entity. Gold markers = main quests. Silver = side quests. Types: _01=?, _02=!, _03=^.',
    params: [
      { label: 'Entity', hint: 'e.g. cavalryman', required: true, mapEntity: true },
      {
        label: 'Marker path',
        hint: 'effects/global_map/quest_mark_gold_01',
        required: true,
        type: 'enum',
        options: [
          'effects/global_map/quest_mark_gold_01',
          'effects/global_map/quest_mark_gold_02',
          'effects/global_map/quest_mark_gold_03',
          'effects/global_map/quest_mark_silver_01',
          'effects/global_map/quest_mark_silver_02',
          'effects/global_map/quest_mark_silver_03',
        ],
      },
    ],
  },
  SetActiveQuestMarker: {
    type: 'SetActiveQuestMarker',
    label: 'Show/Hide Quest Marker',
    category: 'Map Objects',
    description: 'Shows or hides a quest marker on the specified entity. The marker must have been set beforehand with SetQuestMarker.',
    params: [
      { label: 'Entity', hint: 'e.g. dragon_utopia', required: true, mapEntity: true },
      { label: 'Active?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  SetActivePortal: {
    type: 'SetActivePortal',
    label: 'Set Portal Active',
    category: 'Map Objects',
    description: 'Enables or disables a portal. A disabled portal displays as an "exit portal" in-game.',
    params: [
      { label: 'Portal entity', hint: 'e.g. portal_in', required: true, mapEntity: true },
      { label: 'Active?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  SetActiveMarker: {
    type: 'SetActiveMarker',
    label: 'Enable/Disable Trigger Zone',
    category: 'Map Objects',
    description: 'Enables or disables the trigger zone with the specified entity. Non-disabled zones interrupt hero movement every time — even if their action had an unmet precondition.',
    params: [
      { label: 'Zone entity', hint: 'e.g. zone_found_river_source', required: true, mapEntity: true },
      { label: 'Active?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  DeleteEntity: {
    type: 'DeleteEntity',
    label: 'Delete Entity',
    category: 'Map Objects',
    description: 'Removes any entity (interactive object, decoration, VFX, castle, neutral squad) from the map, EXCEPT heroes. Non-interactive objects require "No combine geometry" property.',
    params: [
      { label: 'Entity', hint: 'e.g. block_1_1', required: true, mapEntity: true },
    ],
  },
  DeleteMarkerByNode: {
    type: 'DeleteMarkerByNode',
    label: 'Delete Trigger Zone by Node',
    category: 'Map Objects',
    description: 'Deletes ONE trigger zone whose cells lie in the specified node. Used for zones without their own entity property (e.g. zones ending with "resultDialog": "Interrupt").',
    params: [
      { label: 'Node index', hint: 'e.g. 1234', required: true },
    ],
  },
  EntityActionsOff: {
    type: 'EntityActionsOff',
    label: 'Disable Entity Triggers',
    category: 'Map Objects',
    description: 'Disables all triggers on the object with the specified entity. Permanently removes all Actions Before and Actions After.',
    params: [
      { label: 'Entity', hint: 'e.g. cirque', required: true, mapEntity: true },
    ],
  },

  // ── Neutral Squads ─────────────────────────────────────────────────────────

  SpawnSquad: {
    type: 'SpawnSquad',
    label: 'Spawn Neutral Squad',
    category: 'Squads',
    description: 'Adds a new neutral squad at the specified node with the given total strength value. boolDifficulty: multiply value by difficulty coefficient.',
    params: [
      { label: 'Squad SID', hint: 'e.g. wolf_raiders', required: true },
      { label: 'Node index', hint: 'e.g. 1234', required: true },
      { label: 'Value (strength)', hint: 'e.g. 1000', required: true, type: 'number' },
      { label: 'Scale by difficulty?', hint: 'true', required: false, type: 'enum', options: ['true', 'false'] },
      { label: 'Entity SID', hint: 'optional', required: false, mapEntity: true },
    ],
  },
  SpawnSquadNPC: {
    type: 'SpawnSquadNPC',
    label: 'Spawn NPC Squad',
    category: 'Squads',
    description: 'Like SpawnSquad but combat cannot be initiated upon interaction. Used for squads that call a dialog via SquadInteraction condition.',
    params: [
      { label: 'Squad SID', hint: 'e.g. wolf_raiders', required: true },
      { label: 'Node index', hint: 'e.g. 1234', required: true },
      { label: 'Value (strength)', hint: 'e.g. 1000', required: true, type: 'number' },
      { label: 'Scale by difficulty?', hint: 'true', required: false, type: 'enum', options: ['true', 'false'] },
      { label: 'Entity SID', hint: 'optional', required: false, mapEntity: true },
    ],
  },
  SetFlagEscape: {
    type: 'SetFlagEscape',
    label: 'Set Squad Escape Flag',
    category: 'Squads',
    description: 'Enables or disables the ability for the squad to flee instead of fighting.',
    params: [
      { label: 'Squad entity', hint: 'e.g. wolf_pack_1', required: true, mapEntity: true },
      { label: 'Enable?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  SetFlagAutobattle: {
    type: 'SetFlagAutobattle',
    label: 'Set Squad Auto-Battle Flag',
    category: 'Squads',
    description: 'Enables or disables the ability for the squad to resolve combat via auto-calculation.',
    params: [
      { label: 'Squad entity', hint: 'e.g. wolf_pack_1', required: true, mapEntity: true },
      { label: 'Enable?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  ChangeCampaignDiplomacy: {
    type: 'ChangeCampaignDiplomacy',
    label: 'Set Guaranteed Free Join',
    category: 'Squads',
    description: 'Enables or disables guaranteed free joining for the squad.',
    params: [
      { label: 'Squad entity', hint: 'e.g. wolf_pack_1', required: true, mapEntity: true },
      { label: 'Enable?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  ChangeAlwaysDiplomacy: {
    type: 'ChangeAlwaysDiplomacy',
    label: 'Set Diplomacy Join Offer',
    category: 'Squads',
    description: 'Enables or disables the ability for the squad to offer to join via the "Diplomacy" mechanic.',
    params: [
      { label: 'Squad entity', hint: 'e.g. wolf_pack_1', required: true, mapEntity: true },
      { label: 'Enable?', hint: 'true', required: true, type: 'enum', options: ['true', 'false'] },
    ],
  },
  ChangeSquadReactionType: {
    type: 'ChangeSquadReactionType',
    label: 'Change Squad Mood',
    category: 'Squads',
    description: 'Changes the mood of the squad, affecting the chance it will offer to join. Aggressive=0%, Negative=½x, Common=1x, Friendly=2.5x, Peaceful=5x, Docile=0%.',
    params: [
      { label: 'Squad entity', hint: 'e.g. wolf_pack_1', required: true, mapEntity: true },
      {
        label: 'Affinity',
        hint: 'Common',
        required: true,
        type: 'enum',
        options: ['Aggressive', 'Negative', 'Common', 'Friendly', 'Peaceful', 'Docile'],
      },
    ],
  },
  IncreaseStrengthSquad: {
    type: 'IncreaseStrengthSquad',
    label: 'Increase Squad Strength',
    category: 'Squads',
    description: 'Increases the total strength/size of the squad by the specified percentage. Write as decimal fraction (e.g. 0.65 = 65%).',
    params: [
      { label: 'Squad entity', hint: 'e.g. skeleton_2', required: true, mapEntity: true },
      { label: 'Percent', hint: 'e.g. 0.65 for 65%', required: true },
    ],
  },
  ReduceStrengthSquad: {
    type: 'ReduceStrengthSquad',
    label: 'Reduce Squad Strength',
    category: 'Squads',
    description: 'Decreases the total strength/size of the squad by the specified percentage. Minimum size is 1. Write as decimal fraction (e.g. 0.2 = 20%).',
    params: [
      { label: 'Squad entity', hint: 'e.g. skeleton_1', required: true, mapEntity: true },
      { label: 'Percent', hint: 'e.g. 0.2 for 20%', required: true },
    ],
  },
  DeleteSquad: {
    type: 'DeleteSquad',
    label: 'Delete Squad',
    category: 'Squads',
    description: 'Removes the neutral squad from the map with an animation. indexAnimation: 0=death, 1=flee (dust cloud), 2=join (shining flash).',
    params: [
      { label: 'Squad entity', hint: 'e.g. blocking_squad1', required: true, mapEntity: true },
      { label: 'Animation', hint: '0=death, 1=flee, 2=join', required: false, type: 'enum', options: ['0', '1', '2'] },
    ],
  },

  // ── Heroes ─────────────────────────────────────────────────────────────────

  SpawnHero: {
    type: 'SpawnHero',
    label: 'Spawn Hero',
    category: 'Heroes',
    description: 'Creates a hero with the specified SID belonging to the specified player at the given node. Player index starts at 0.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node index', hint: 'e.g. 47', required: true },
      { label: 'Player index', hint: '0=Player1, 1=Player2', required: true, type: 'number' },
    ],
  },
  DeleteHero: {
    type: 'DeleteHero',
    label: 'Delete Hero',
    category: 'Heroes',
    description: '"Kills" the hero with the specified SID. Triggers the HeroKill condition.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveUnitHero: {
    type: 'GiveUnitHero',
    label: 'Give Units to Hero',
    category: 'Heroes',
    description: 'Adds a stack of X units to the army of the specified hero. If army is full, the "accept creatures" UI opens.',
    params: [
      { label: 'Unit SID', hint: 'e.g. hive_queen', required: true, entity: 'creature' },
      { label: 'Count', hint: 'e.g. 5', required: true, type: 'number' },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveUnitHeroPerWeek: {
    type: 'GiveUnitHeroPerWeek',
    label: 'Give Units × Week Number',
    category: 'Heroes',
    description: 'Adds [X × current week number] units to the hero\'s army. Week numbering does NOT reset with a new month.',
    params: [
      { label: 'Unit SID', hint: 'e.g. jaw', required: true, entity: 'creature' },
      { label: 'Count', hint: 'e.g. 3', required: true, type: 'number' },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveUnitHeroPerMonth: {
    type: 'GiveUnitHeroPerMonth',
    label: 'Give Units × Month Number',
    category: 'Heroes',
    description: 'Adds [X × current month number] units to the hero\'s army.',
    params: [
      { label: 'Unit SID', hint: 'e.g. jaw', required: true, entity: 'creature' },
      { label: 'Count', hint: 'e.g. 3', required: true, type: 'number' },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  RemoveUnitHero: {
    type: 'RemoveUnitHero',
    label: 'Remove Units from Hero',
    category: 'Heroes',
    description: 'Removes X units of the specified type from the hero\'s army. Use "all" instead of a number to remove all units of that type.',
    params: [
      { label: 'Unit SID', hint: 'e.g. hive_queen', required: true, entity: 'creature' },
      { label: 'Count', hint: '"all" or a number', required: true },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveExpHero: {
    type: 'GiveExpHero',
    label: 'Give Experience to Hero',
    category: 'Heroes',
    description: 'Gives X experience points to the specified hero.',
    params: [
      { label: 'Amount', hint: 'e.g. 1000', required: true, type: 'number' },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  GiveStatsHero: {
    type: 'GiveStatsHero',
    label: 'Give Stats to Hero',
    category: 'Heroes',
    description: 'Adds X points of the specified stat to the hero. X can be negative (reduces stats down to 0). Leave hero SID blank for the currently selected hero.',
    params: [
      {
        label: 'Stat',
        hint: 'offence',
        required: true,
        type: 'enum',
        options: ['offence', 'defence', 'spellPower', 'intelligence', 'luck', 'moral'],
      },
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      { label: 'Amount', hint: 'e.g. 2 (can be negative)', required: true, type: 'number' },
    ],
  },
  GiveManaHero: {
    type: 'GiveManaHero',
    label: 'Add Mana to Hero',
    category: 'Heroes',
    description: 'Adds X mana to the current mana pool of the hero. X can be negative (reduces mana down to 0). Leave hero SID blank for the currently selected hero.',
    params: [
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      { label: 'Amount', hint: 'e.g. 50 (can be negative)', required: true, type: 'number' },
    ],
  },
  ChangeManaHero: {
    type: 'ChangeManaHero',
    label: 'Set Hero Mana',
    category: 'Heroes',
    description: "Sets the hero's current mana pool to the specified value. Leave hero SID blank for the currently selected hero.",
    params: [
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      { label: 'Mana amount', hint: 'e.g. 130', required: true, type: 'number' },
    ],
  },
  AddSpellHero: {
    type: 'AddSpellHero',
    label: 'Teach Spell to Hero',
    category: 'Heroes',
    description: 'Adds the spell to the spellbook of the hero.',
    params: [
      { label: 'Spell SID', hint: 'e.g. day_1_magic_healing_water', required: true, entity: 'spell' as const },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  AddSkillHero: {
    type: 'AddSkillHero',
    label: 'Add Skill to Hero',
    category: 'Heroes',
    description: 'Adds the skill to the skill list of the hero (if there is a free slot).',
    params: [
      { label: 'Skill SID', hint: 'e.g. skill_faction_demons', required: true, entity: 'skill' as const },
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  AddSkillAll: {
    type: 'AddSkillAll',
    label: 'Add Skill to All Heroes',
    category: 'Heroes',
    description: 'Adds the skill to the skill list of ALL heroes of the given player (if each has a free slot).',
    params: [
      { label: 'Skill SID', hint: 'e.g. skill_faction_demons', required: true, entity: 'skill' as const },
    ],
  },
  GiveItemHero: {
    type: 'GiveItemHero',
    label: 'Give Item to Hero',
    category: 'Heroes',
    description: 'Gives an artifact to the hero. Leave hero SID blank to give to the currently selected hero.',
    params: [
      { label: 'Item SID', hint: 'e.g. catechism_of_night_magic_artifact', required: true, entity: 'artifact' },
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
    ],
  },
  RemoveItem: {
    type: 'RemoveItem',
    label: 'Remove Item from Player',
    category: 'Heroes',
    description: 'Sequentially checks the inventory of every hero belonging to the player and removes the first encountered item with the specified SID.',
    params: [
      { label: 'Item SID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
    ],
  },
  AddBuffHeroDays: {
    type: 'AddBuffHeroDays',
    label: 'Apply Buff to Hero',
    category: 'Heroes',
    description: 'Applies a buff to the hero for X turns. Leave X empty for permanent (until mission end). Leave hero SID blank for the currently selected hero.',
    params: [
      { label: 'Buff SID', hint: 'e.g. campaign_infinite_moves_buff', required: true, entity: 'buff' as const },
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      { label: 'Days', hint: 'Leave blank for permanent', required: false, type: 'number' },
    ],
  },
  RemoveBuffHero: {
    type: 'RemoveBuffHero',
    label: 'Remove Buff from Hero',
    category: 'Heroes',
    description: 'Removes the specified buff from the hero permanently. Leave hero SID blank for the currently selected hero.',
    params: [
      { label: 'Buff SID', hint: 'e.g. cm_fun_necromancy_power_disabled', required: true, entity: 'buff' as const },
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
    ],
  },
  SetHeroMovePoints: {
    type: 'SetHeroMovePoints',
    label: 'Set Hero Move Points',
    category: 'Heroes',
    description: "Sets the hero's current movement points to the specified value. Leave hero SID blank for the currently selected hero.",
    params: [
      { label: 'Hero SID', hint: 'Leave blank for selected hero', required: false, entity: 'hero' },
      { label: 'Move points', hint: 'e.g. 9999', required: true, type: 'number' },
    ],
  },
  HeroResetMovePointsMax: {
    type: 'HeroResetMovePointsMax',
    label: 'Zero Max Move Points',
    category: 'Heroes',
    description: "Resets the maximum movement points of the hero to zero. The movement bar always appears visually full (0/0).",
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  HeroStop: {
    type: 'HeroStop',
    label: 'Stop Hero',
    category: 'Heroes',
    description: "Stops the movement of the currently selected hero and clears the unfinished route.",
    params: [],
  },
  StepBack: {
    type: 'StepBack',
    label: 'Step Back',
    category: 'Heroes',
    description: 'Forces the currently selected hero to step back to the cell from which the last step was taken. Used to prevent combat with NPC squads/heroes. Must be used with BreakInterruptions.',
    params: [],
  },
  HeroToNode: {
    type: 'HeroToNode',
    label: 'Move Hero to Node',
    category: 'Heroes',
    description: 'Forces the specified hero to move to the node and/or interact with any object/squad in it. Works for both human and AI heroes. If path cannot be built, the hero does not move.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node index', hint: 'e.g. 47', required: true },
    ],
  },
  HeroToHero: {
    type: 'HeroToHero',
    label: 'Move Hero Toward Hero',
    category: 'Heroes',
    description: 'Forces hero1 to move toward hero2 and start combat or open "Exchange" UI. Works for both human and AI heroes.',
    params: [
      { label: 'Moving hero SID', hint: 'e.g. cm_fun_hero_human_1', required: true, entity: 'hero' },
      { label: 'Target hero SID', hint: 'e.g. cm_fun_hero_1', required: true, entity: 'hero' },
    ],
  },
  TeleportHero: {
    type: 'TeleportHero',
    label: 'Teleport Hero',
    category: 'Heroes',
    description: 'Teleports the hero to one random cell from the list of node indices. If only one node is given, the hero is guaranteed to teleport there.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
      { label: 'Node index 1', hint: 'e.g. 47', required: true },
      { label: 'Node index 2', hint: 'optional', required: false },
      { label: 'Node index 3', hint: 'optional', required: false },
    ],
  },
  InitiateInteract: {
    type: 'InitiateInteract',
    label: 'Initiate Interaction',
    category: 'Heroes',
    description: 'Initiates a remote interaction between the currently selected hero and the squad or object with the specified entity. Distance does not matter.',
    params: [
      { label: 'Entity', hint: 'e.g. my_object_1', required: true, mapEntity: true },
    ],
  },
  InitiateAttack: {
    type: 'InitiateAttack',
    label: 'Initiate Attack',
    category: 'Heroes',
    description: 'Remotely initiates combat between the currently selected hero and the squad with the specified entity. Distance does not matter.',
    params: [
      { label: 'Squad entity', hint: 'e.g. blocking_squad1', required: true, mapEntity: true },
    ],
  },
  ForceLastInteractObject: {
    type: 'ForceLastInteractObject',
    label: 'Force Last Object Interaction',
    category: 'Heroes',
    description: 'Initiates a remote interaction between the currently selected hero and the last object the player interacted with (calls its "internal logic").',
    params: [],
  },
  ForceLastInteractSquad: {
    type: 'ForceLastInteractSquad',
    label: 'Force Last Squad Interaction',
    category: 'Heroes',
    description: 'Initiates a remote interaction between the currently selected hero and the last squad the player interacted with.',
    params: [],
  },
  HeroInteractWorldObject: {
    type: 'HeroInteractWorldObject',
    label: 'Hero Interact with Nearest Object',
    category: 'Heroes',
    description: 'Forces the specified hero to find the nearest available object on the map and interact with it. Auxiliary technical action.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  ResurrectHero: {
    type: 'ResurrectHero',
    label: 'Resurrect Hero',
    category: 'Heroes',
    description: 'Resurrects a defeated hero at a map node.',
    params: [
      { label: 'Hero SID', hint: 'e.g. nature_hero_6', required: true, entity: 'hero' },
      { label: 'Node index', hint: 'e.g. 234', required: true },
      { label: 'Flag', hint: '0', required: false },
    ],
  },

  // ── AI ─────────────────────────────────────────────────────────────────────

  AiBanArea: {
    type: 'AiBanArea',
    label: 'AI Ban Area',
    category: 'AI',
    description: 'Blocks the AI from entering the zone containing the specified node.',
    params: [
      { label: 'Node index', hint: 'e.g. 1816', required: true },
    ],
  },
  AiUnbanArea: {
    type: 'AiUnbanArea',
    label: 'AI Unban Area',
    category: 'AI',
    description: 'Unblocks the AI for the zone containing the specified node.',
    params: [
      { label: 'Node index', hint: 'e.g. 1816', required: true },
    ],
  },
  AiClearBanArea: {
    type: 'AiClearBanArea',
    label: 'AI Clear All Bans',
    category: 'AI',
    description: 'Unblocks all zones for the AI.',
    params: [],
  },
  AiOnSelectHero: {
    type: 'AiOnSelectHero',
    label: 'AI Recalculate Objectives',
    category: 'AI',
    description: 'Triggers a recalculation of the AI\'s current objectives. Simulates the start of a new day in AI logic.',
    params: [],
  },
  DisableAIHero: {
    type: 'DisableAIHero',
    label: 'Disable AI Hero',
    category: 'AI',
    description: 'Completely removes the specified hero from AI logic. Must be called BEFORE giving movement commands to an AI hero.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  EnableAIHero: {
    type: 'EnableAIHero',
    label: 'Enable AI Hero',
    category: 'AI',
    description: 'Re-enables AI for the specified hero (previously disabled by DisableAIHero).',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  EnableAiResurrect: {
    type: 'EnableAiResurrect',
    label: 'Enable AI Auto-Resurrection',
    category: 'AI',
    description: 'Enables campaign-unique auto-resurrection for the specified hero. Campaign AI only.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  DisableAiResurrect: {
    type: 'DisableAiResurrect',
    label: 'Disable AI Auto-Resurrection',
    category: 'AI',
    description: 'Disables campaign-unique auto-resurrection for the specified hero. Campaign AI only.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTION_REGISTRY)

export const ACTION_CATEGORIES: string[] = [
  ...new Set(ACTION_LIST.map((a) => a.category)),
]
