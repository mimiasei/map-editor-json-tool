// ─── Dialog condition registry ────────────────────────────────────────────────
// Defines the 13 dialog condition types, their labels, descriptions, and parameters.
// Source: https://unfrozen.notion.site/Dialog-conditions-Full-list-...
//
// Dialog conditions decide whether a dialog slide plays or an answer is offered — the
// official guide is explicit that they "have nothing to do with script conditions" and
// "cannot be used inside the quest file." They are a smaller, separate vocabulary from
// CONDITION_REGISTRY (src/schema/conditions.ts), and four names collide between the two
// with different, incompatible parameter shapes:
//   - ItemOwnSide:  dialog [sidItem, X] (X optional, default 1)  vs script [sidItem, op, X]
//   - HeroStat:     dialog [statName, op, X] (hero implicit)     vs script [sidHero, statName, op, X]
//   - UnitOwnHero:  dialog [sidUnit, op, X] (hero implicit)      vs script [sidHero, sidUnit, op, X]
// Reusing CONDITION_REGISTRY for dialog conditions — which the editor did until this file
// existed — rendered the wrong fields for these three and would write JSON in a shape the
// dialog engine doesn't expect. This registry exists so dialog conditions get their own,
// correct parameter definitions instead.
//
// The tool supports custom/unknown types — users can type any string as the type.

import type { ParamDef, ConditionDef } from './conditions'

export const DIALOG_CONDITION_REGISTRY: Record<string, ConditionDef> = {

  // ── Counters ────────────────────────────────────────────────────────────────

  StoryCounter: {
    type: 'StoryCounter',
    label: 'Campaign Counter Check',
    description: 'Met if the value of the campaign counter with the specified SID satisfies the inequality. Only checks counters of the campaign the dialog was triggered within.',
    params: [
      { label: 'Story counter SID', hint: 'e.g. main_campaign_stage', required: true },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  Counter: {
    type: 'Counter',
    label: 'Local Counter Check',
    description: 'Met if the value of the local counter with the specified SID (from the "counters" block of the current map) satisfies the inequality.',
    params: [
      { label: 'Counter SID', hint: 'e.g. main_quest_stage', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  CompareCounters: {
    type: 'CompareCounters',
    label: 'Compare Two Local Counters',
    description: 'Met if the values of the two specified local counters satisfy the inequality.',
    params: [
      { label: 'Counter SID 1', hint: 'e.g. counter_a', required: true, ref: 'counter' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Counter SID 2', hint: 'e.g. counter_b', required: true, ref: 'counter' },
    ],
  },

  // ── Hero (the currently selected / participating hero) ────────────────────────

  Hero: {
    type: 'Hero',
    label: 'Is Selected Hero',
    description: 'Met if the SID of the currently selected hero (in most cases, the hero participating in the dialogue) matches the specified SID.',
    params: [
      { label: 'Hero SID', hint: 'e.g. demon_hero_6', required: true, entity: 'hero' },
    ],
  },
  ItemOwnHero: {
    type: 'ItemOwnHero',
    label: 'Hero Owns Item',
    description: 'Met if the currently selected hero has the specified artifact in their inventory (backpack or worn).',
    params: [
      { label: 'Item SID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
    ],
  },
  SpellOwnHero: {
    type: 'SpellOwnHero',
    label: 'Hero Knows Spell',
    description: 'Met if the currently selected hero has the specified spell in their spellbook.',
    params: [
      { label: 'Spell SID', hint: 'e.g. fireball', required: true, entity: 'spell' },
    ],
  },
  UnitOwnHero: {
    type: 'UnitOwnHero',
    label: 'Hero Owns Units',
    description: "Met if the number of the specified unit in the currently selected hero's army satisfies the inequality.",
    params: [
      { label: 'Unit SID', hint: 'e.g. dragon_hunter', required: true, entity: 'creature' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },
  HeroStat: {
    type: 'HeroStat',
    label: 'Hero Stat Check',
    description: "Met if the numerical value of the currently selected hero's specified attribute satisfies the inequality.",
    params: [
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

  // ── Player ─────────────────────────────────────────────────────────────────────

  ResCounter: {
    type: 'ResCounter',
    label: 'Resource Check',
    description: "Met if the player's current stock of the specified resource satisfies the inequality.",
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
  ItemOwnSide: {
    type: 'ItemOwnSide',
    label: 'Player Owns Item',
    description: 'Met if the player currently has at least the given total of the specified artifact across all heroes\' inventories. Value defaults to 1 if omitted.',
    params: [
      { label: 'Item SID', hint: 'e.g. fallen_angel_wings_artifact', required: true, entity: 'artifact' },
      { label: 'Value', hint: 'optional, defaults to 1', required: false, type: 'number' },
    ],
  },
  UnitOwnSide: {
    type: 'UnitOwnSide',
    label: 'Player Owns Units',
    description: "Met if the total number of the specified unit across all of the player's heroes satisfies the inequality.",
    params: [
      { label: 'Unit SID', hint: 'e.g. lich_upg_alt', required: true, entity: 'creature' },
      { label: 'Operator', hint: '>', required: true, type: 'enum', options: ['=', '>', '<', '>=', '<='] },
      { label: 'Value', hint: 'e.g. 1', required: true, type: 'number' },
    ],
  },

  // ── General ────────────────────────────────────────────────────────────────────

  Difficulty: {
    type: 'Difficulty',
    label: 'Campaign Difficulty Check',
    description: 'Met if the currently selected campaign mission difficulty matches the specified index. Only works within a campaign. 0=Easy, 1=Normal, 2=Hard, 3=Impossible, 4=Deadly.',
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
  SquadDestroyed: {
    type: 'SquadDestroyed',
    label: 'Squad Destroyed',
    description: 'Met if the specified neutral squad has already been destroyed on the map by the time this slide would open — by any means (combat, fleeing, or a delete action). It does not matter which player defeated it.',
    params: [
      { label: 'Squad entity', hint: 'e.g. skeleton_2', required: true, mapEntity: true },
    ],
  },
}

export const DIALOG_CONDITION_LIST: ConditionDef[] = Object.values(DIALOG_CONDITION_REGISTRY)

export type { ParamDef, ConditionDef }
