// ─── Artifact bonus catalog ──────────────────────────────────────────────────
// Plain data backing ArtifactBonusesEditor.tsx's friendly "Effect" pickers.
// Every id/label/value-shape here is confirmed against real bonuses across
// all 13 Core/DB/items/items/*.json files (~185 items, 579 bonus instances);
// every description is taken from or closely paraphrases the real item's own
// localized description in Core/Lang/english/texts/*.json — never invented.
// Where real data never varies a parameter, it's hardcoded rather than
// exposed as a field (e.g. magicSidSet's trailing "3" is constant across all
// 72 real instances — only the spell varies).

export type AttributeValueKind = 'number' | 'percent' | 'boolean'

export interface AttributeDef {
  id: string
  label: string
  description: string
  valueKind: AttributeValueKind
  /** Only for valueKind 'boolean' — the raw string parameter value written
   *  when the checkbox is checked. Defaults to 'true'; flyMotionPerBonus is
   *  the one real exception (its only real instance uses '0', not 'true'). */
  trueValue?: string
  group: string
}

// ── Hero attributes (heroStat's generic key/value grab-bag) ─────────────────
// heroStat is not a simple "6 stats" type — real data has 30+ distinct first-
// parameter "stat keys". The 5 with their own richer, multi-part shape
// (magicSidSet, magicCostSidSet, magicSchoolSet, magicCounterSet,
// outDmgMultipliersSet) get dedicated effects in ArtifactBonusesEditor
// instead of appearing here; everything else real data uses as a plain
// [key, amount] pair is listed below.
export const HERO_ATTRIBUTES: AttributeDef[] = [
  { id: 'offence', label: 'Attack', description: "Increases the hero's Attack, boosting damage dealt by their army.", valueKind: 'number', group: 'Combat stats' },
  { id: 'defence', label: 'Defense', description: "Increases the hero's Defense, reducing damage taken by their army.", valueKind: 'number', group: 'Combat stats' },
  { id: 'spellPower', label: 'Spell Power', description: "Increases the hero's Spell Power, boosting the effect of spells cast.", valueKind: 'number', group: 'Combat stats' },
  { id: 'intelligence', label: 'Knowledge', description: "Increases the hero's Knowledge, boosting maximum mana.", valueKind: 'number', group: 'Combat stats' },
  { id: 'moral', label: 'Morale', description: "Increases the hero's army Morale.", valueKind: 'number', group: 'Combat stats' },
  { id: 'luck', label: 'Luck', description: "Increases the hero's army Luck.", valueKind: 'number', group: 'Combat stats' },
  { id: 'offencePer', label: 'Attack (%)', description: 'Adds a percentage bonus on top of the total Attack stat (real artifacts pair this with a flat Attack bonus).', valueKind: 'percent', group: 'Combat stats' },
  { id: 'defencePer', label: 'Defense (%)', description: 'Adds a percentage bonus on top of the total Defense stat.', valueKind: 'percent', group: 'Combat stats' },
  { id: 'spellPowerPer', label: 'Spell Power (%)', description: 'Adds a percentage bonus on top of the total Spell Power stat.', valueKind: 'percent', group: 'Combat stats' },
  { id: 'intelligencePer', label: 'Knowledge (%)', description: 'Adds a percentage bonus on top of the total Knowledge stat.', valueKind: 'percent', group: 'Combat stats' },
  { id: 'manaRestoreBonus', label: 'Mana Regeneration', description: 'Restores extra mana to the hero every morning.', valueKind: 'number', group: 'Magic' },
  { id: 'magicCdBonus', label: 'Spell Cooldown', description: "Changes the cooldown (in rounds) of all the hero's spells; negative reduces it.", valueKind: 'number', group: 'Magic' },
  { id: 'magicCastsPerRound', label: 'Extra Spellbook Uses', description: 'Lets the hero cast this many additional spells per battle round.', valueKind: 'number', group: 'Magic' },
  { id: 'manaCostBonus', label: 'Spell Mana Cost', description: 'Changes how much mana spells cost to cast; negative makes them cheaper.', valueKind: 'number', group: 'Magic' },
  { id: 'minAllowedMagicRank', label: 'Spell Rank Lock', description: 'Blocks the hero and the enemy hero from casting spells of this tier or higher, in combat.', valueKind: 'number', group: 'Magic' },
  { id: 'startEnergyBonus', label: 'Starting Focus', description: 'Grants this many Focus Points at the start of battle.', valueKind: 'number', group: 'Magic' },
  { id: 'outComingBuffDuration', label: 'Outgoing Positive Effect Duration', description: "Positive effects the hero applies (e.g. from spells) last this many rounds longer.", valueKind: 'number', group: 'Magic' },
  { id: 'outComingDebuffDuration', label: 'Outgoing Negative Effect Duration', description: 'Negative effects the hero applies (e.g. from spells) last this many rounds longer.', valueKind: 'number', group: 'Magic' },
  { id: 'diplomacyEfficiencyPerBonus', label: 'Diplomacy Persuasion', description: 'Increases Persuasion Power when using Diplomacy, as a percentage.', valueKind: 'percent', group: 'Exploration' },
  { id: 'movementBonus', label: 'Movement Points', description: 'Grants the hero extra movement points on the adventure map.', valueKind: 'number', group: 'Exploration' },
  { id: 'viewRadius', label: 'Sight Radius', description: 'Increases how far the hero can see on the adventure map.', valueKind: 'number', group: 'Exploration' },
  { id: 'landscapePenaltyPerBonus', label: 'Terrain Penalty Reduction', description: 'Reduces movement penalties from difficult terrain (-1 removes them entirely).', valueKind: 'number', group: 'Exploration' },
  { id: 'flyMotionPerBonus', label: 'Constant Flight', description: 'Grants the hero permanent flight on the adventure map.', valueKind: 'boolean', trueValue: '0', group: 'Exploration' },
  { id: 'enableBansEvasion', label: 'Ignore Battle Restrictions', description: 'Negates effects that restrict creature rearrangement, surrender, fleeing, and using the Spellbook/abilities in battle.', valueKind: 'boolean', group: 'Special abilities' },
  { id: 'enableBansEvasionBattle', label: 'Ignore Battle Restrictions (combat variant)', description: 'The combat-scoped twin of "Ignore Battle Restrictions" — real artifacts that grant one also grant the other.', valueKind: 'boolean', group: 'Special abilities' },
  { id: 'enableSavePartyByEscape', label: 'Keep Army When Fleeing', description: "The hero's army isn't lost when the hero flees from battle.", valueKind: 'boolean', group: 'Special abilities' },
  { id: 'enableSaveHeroByKill', label: 'Rehireable After Defeat', description: 'If the hero is defeated, they can still be hired again from the Tavern.', valueKind: 'boolean', group: 'Special abilities' },
]

// ── Creature attributes (unitStat's plain-key grab-bag) ──────────────────────
export const UNIT_ATTRIBUTES: AttributeDef[] = [
  { id: 'moral', label: 'Morale', description: "Changes the affected creatures' Morale.", valueKind: 'number', group: 'Combat stats' },
  { id: 'luck', label: 'Luck', description: "Changes the affected creatures' Luck.", valueKind: 'number', group: 'Combat stats' },
  { id: 'initiative', label: 'Initiative', description: "Changes the affected creatures' Initiative (turn order in battle).", valueKind: 'number', group: 'Combat stats' },
  { id: 'speed', label: 'Speed', description: "Changes the affected creatures' movement Speed in battle.", valueKind: 'number', group: 'Combat stats' },
  { id: 'hp', label: 'Health', description: "Changes the affected creatures' maximum HP.", valueKind: 'number', group: 'Combat stats' },
  { id: 'damageMin', label: 'Minimum Damage', description: "Changes the affected creatures' minimum damage.", valueKind: 'number', group: 'Combat stats' },
  { id: 'damageMax', label: 'Maximum Damage', description: "Changes the affected creatures' maximum damage.", valueKind: 'number', group: 'Combat stats' },
  { id: 'offencePerc', label: 'Attack (%)', description: "Changes the affected creatures' Attack, as a percentage.", valueKind: 'percent', group: 'Combat stats' },
  { id: 'defencePerc', label: 'Defense (%)', description: "Changes the affected creatures' Defense, as a percentage.", valueKind: 'percent', group: 'Combat stats' },
  { id: 'finalAbilityDamageBonusPercent', label: 'Ability Damage (%)', description: "Changes the damage the affected creatures' abilities deal, as a percentage.", valueKind: 'percent', group: 'Combat stats' },
  { id: 'abilityCdBonus', label: 'Ability Cooldown', description: 'Changes the cooldown (in rounds) of the affected creatures’ abilities.', valueKind: 'number', group: 'Effects' },
  { id: 'inComingBuffDuration', label: 'Incoming Positive Effect Duration', description: 'Positive effects applied ON the affected creatures last this many rounds longer.', valueKind: 'number', group: 'Effects' },
  { id: 'inComingDebuffDuration', label: 'Incoming Negative Effect Duration', description: 'Negative effects applied ON the affected creatures last this many rounds longer (negative shortens them).', valueKind: 'number', group: 'Effects' },
  { id: 'outComingBuffDuration', label: 'Outgoing Positive Effect Duration', description: 'Positive effects applied BY the affected creatures last this many rounds longer.', valueKind: 'number', group: 'Effects' },
  { id: 'outComingDebuffDuration', label: 'Outgoing Negative Effect Duration', description: 'Negative effects applied BY the affected creatures last this many rounds longer.', valueKind: 'number', group: 'Effects' },
]

// ── Battle-only hero attributes (heroStatBattle's grab-bag) ─────────────────
// heroStatBattle reuses heroStat's key vocabulary for some keys (e.g.
// magicSchoolSet, minAllowedMagicRank) — those get their own dedicated
// effect definitions in ArtifactBonusesEditor since their trailing constants
// differ from the heroStat versions. This list covers the rest.
export const BATTLE_HERO_ATTRIBUTES: AttributeDef[] = [
  { id: 'banTactics', label: 'Ban Pre-Battle Rearranging', description: 'The target cannot rearrange their creatures before the start of battle.', valueKind: 'boolean', group: 'Battle rules' },
  { id: 'enableBattleEscapeBan', label: 'Ban Surrender and Flee', description: 'Prevents the target from surrendering or fleeing in battle.', valueKind: 'boolean', group: 'Battle rules' },
  { id: 'spellPowerPer', label: 'Spell Power (%)', description: "Changes the target's Spell Power for this battle, as a percentage.", valueKind: 'percent', group: 'Magic' },
  { id: 'magicCdBonus', label: 'Spell Cooldown', description: "Changes the cooldown (in rounds) of the target's spells for this battle.", valueKind: 'number', group: 'Magic' },
]

// ── Shared small enums, all confirmed against real bonus parameters ────────

/** Real display names confirmed from Core/Lang/english/texts/magic.json.
 *  No confirmed display token exists for 'neutral' — used only where real
 *  data confirms neutral is a valid value (magicCounterSet). */
export const MAGIC_SCHOOL_OPTIONS = [
  { id: 'day', label: 'Daylight Magic' },
  { id: 'night', label: 'Nightshade Magic' },
  { id: 'space', label: 'Arcane Magic' },
  { id: 'primal', label: 'Primal Magic' },
]

export const MAGIC_SCHOOL_OPTIONS_WITH_NEUTRAL = [
  ...MAGIC_SCHOOL_OPTIONS,
  { id: 'neutral', label: 'Neutral' },
]

/** heroMagicAdditionMass's spell-tier filter — confirmed real values 1-5 or "any". */
export const SPELL_TIER_OPTIONS = ['any', '1', '2', '3', '4', '5']

/** unitStat's five confirmed "Modify Creature Damage" shapes — direction +
 *  damage/attack-type combos are exhaustively confirmed against real data,
 *  each combo's parameters hardcoded except the percentage. */
export interface DamageModOption {
  id: string
  label: string
  parameters: [string, string, string]
}
export const DAMAGE_MOD_OPTIONS: DamageModOption[] = [
  { id: 'incoming-magic', label: 'Incoming Magic Damage', parameters: ['modifierSet', 'inDmgMods', 'magic_damage'] },
  { id: 'outgoing-ranged', label: 'Outgoing Ranged Damage', parameters: ['modifierSet', 'outDmgMods', 'shoot_attack'] },
  { id: 'outgoing-melee', label: 'Outgoing Melee Damage', parameters: ['modifierSet', 'outDmgMods', 'melee_attack'] },
  { id: 'outgoing-counter', label: 'Outgoing Counterattack Damage', parameters: ['modifierSet', 'outDmgMods', 'counter_attack'] },
  { id: 'ignore-magic-resist', label: 'Enemy Magic Resistance Ignored', parameters: ['outDmgMultipliersSet', 'magic_damage', 'true'] },
]

/** battleSubskillBonus's targetGroup — exhaustive across all 25 real instances. */
export const COMBAT_BUFF_TARGETS = [
  { id: 'unit_buff', label: 'A specific creature' },
  { id: 'side_buff', label: "The hero's whole army" },
  { id: 'hero_ability', label: 'The hero (as an ability)' },
]

export function attributeById(list: AttributeDef[], id: string): AttributeDef | undefined {
  return list.find((a) => a.id === id)
}

export { percentToDisplay, displayToPercent } from '@/lib/percent-utils'
