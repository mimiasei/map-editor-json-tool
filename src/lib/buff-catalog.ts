// ─── Custom buff catalog ──────────────────────────────────────────────────────
// Plain data backing CustomBuffEditorDialog.tsx/BuffStatsEditor.tsx. Every key
// and its value shape is confirmed against real Core/DB/buffs/*.json data (19
// files, 414 buffs) — never invented. Most stat keys are self-describing
// mechanical fields (the same "stat name -> number/percent/boolean" shape
// artifact bonuses already use for hero/creature stats — several keys are
// the exact same underlying names, e.g. `initiative`/`speed`/`damageMin`),
// so descriptions here are direct, literal readings of what the field does,
// not claims about exact numeric balance or animation behavior.

export type BuffValueKind = 'number' | 'percent' | 'boolean'

export interface BuffAttributeDef {
  id: string
  label: string
  description: string
  valueKind: BuffValueKind
  group: string
}

// ── data.stats grab-bag (270/414 real buffs use `data.stats`) ──────────────
// `outDmgMods`/`inDmgMods` are NOT listed here — real data shows they hold a
// nested `{list: [{t, v}]}` of damage-type/percent pairs, not a single value,
// so BuffStatsEditor gives them their own repeatable-list sub-form instead.
export const BUFF_STAT_ATTRIBUTES: BuffAttributeDef[] = [
  // Combat stats
  { id: 'offence', label: 'Attack', description: "Adds to the affected unit's Attack.", valueKind: 'number', group: 'Combat stats' },
  { id: 'defence', label: 'Defense', description: "Adds to the affected unit's Defense.", valueKind: 'number', group: 'Combat stats' },
  { id: 'offencePerc', label: 'Attack (%)', description: "Changes the affected unit's Attack, as a percentage.", valueKind: 'percent', group: 'Combat stats' },
  { id: 'defencePerc', label: 'Defense (%)', description: "Changes the affected unit's Defense, as a percentage.", valueKind: 'percent', group: 'Combat stats' },
  { id: 'initiative', label: 'Initiative', description: "Changes the affected unit's Initiative (turn order in battle).", valueKind: 'number', group: 'Combat stats' },
  { id: 'speed', label: 'Speed', description: "Changes the affected unit's movement Speed in battle.", valueKind: 'number', group: 'Combat stats' },
  { id: 'moral', label: 'Morale', description: "Changes the affected unit's Morale.", valueKind: 'number', group: 'Combat stats' },
  { id: 'luck', label: 'Luck', description: "Changes the affected unit's Luck.", valueKind: 'number', group: 'Combat stats' },

  // Health & damage
  { id: 'hp', label: 'Health', description: "Adds to the affected unit's HP.", valueKind: 'number', group: 'Health & damage' },
  { id: 'hpPerc', label: 'Health (%)', description: "Changes the affected unit's max HP, as a percentage.", valueKind: 'percent', group: 'Health & damage' },
  { id: 'damageMin', label: 'Minimum Damage', description: "Adds to the affected unit's minimum damage.", valueKind: 'number', group: 'Health & damage' },
  { id: 'damageMax', label: 'Maximum Damage', description: "Adds to the affected unit's maximum damage.", valueKind: 'number', group: 'Health & damage' },
  { id: 'damagePerc', label: 'Damage (%)', description: "Changes the affected unit's damage, as a percentage.", valueKind: 'percent', group: 'Health & damage' },
  { id: 'inAllDmgMod', label: 'Incoming Damage (%, all types)', description: 'Changes all damage the affected unit takes, as a percentage.', valueKind: 'percent', group: 'Health & damage' },
  { id: 'outAllDmgMod', label: 'Outgoing Damage (%, all types)', description: 'Changes all damage the affected unit deals, as a percentage.', valueKind: 'percent', group: 'Health & damage' },
  { id: 'alwaysMaxDmg', label: 'Always Deal Maximum Damage', description: "The affected unit's attacks always roll maximum damage.", valueKind: 'boolean', group: 'Health & damage' },
  { id: 'alwaysMinDmg', label: 'Always Deal Minimum Damage', description: "The affected unit's attacks always roll minimum damage.", valueKind: 'boolean', group: 'Health & damage' },
  { id: 'alwaysTakeMaxDmg', label: 'Always Take Maximum Damage', description: 'Attacks against the affected unit always roll maximum damage.', valueKind: 'boolean', group: 'Health & damage' },
  { id: 'accumulateDamage', label: 'Accumulate Damage', description: 'Damage taken by the affected unit is tracked/accumulated rather than applied normally (used by delayed-damage effects).', valueKind: 'boolean', group: 'Health & damage' },
  { id: 'healthLimitMinPercent', label: 'Minimum Health Floor (%)', description: "Sets a floor below which the affected unit's HP can't be reduced by this effect.", valueKind: 'percent', group: 'Health & damage' },

  // Abilities & energy (Focus points)
  { id: 'actionPoints', label: 'Extra Action Points', description: 'Grants the affected unit extra action points (used by focus/ability-cost mechanics).', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'maxAddedApPerRound', label: 'Max Action Points Gained per Round', description: 'Caps how many action points the affected unit can gain in a single round.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'maxEnergy', label: 'Maximum Energy', description: "Changes the affected unit's maximum Focus/energy pool.", valueKind: 'number', group: 'Abilities & energy' },
  { id: 'energyPerCast', label: 'Energy per Cast', description: 'Energy the affected unit gains each time it uses an ability.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'energyPerRound', label: 'Energy per Round', description: 'Energy the affected unit gains automatically each round.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'energyPerTakeDamage', label: 'Energy per Damage Taken', description: 'Energy the affected unit gains whenever it takes damage.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'blockEnergyRegen', label: 'Block Energy Regeneration', description: "Stops the affected unit's energy from regenerating.", valueKind: 'boolean', group: 'Abilities & energy' },
  { id: 'finalAbilityDamageBonusPercent', label: 'Ability Damage (%)', description: "Changes the damage the affected unit's abilities deal, as a percentage.", valueKind: 'percent', group: 'Abilities & energy' },
  { id: 'finalHealingBonusPercent', label: 'Healing Done (%)', description: 'Changes the healing the affected unit provides, as a percentage.', valueKind: 'percent', group: 'Abilities & energy' },
  { id: 'finalSummonBonusPercent', label: 'Summoned Unit Bonus (%)', description: "Changes the strength of creatures the affected unit summons, as a percentage.", valueKind: 'percent', group: 'Abilities & energy' },
  { id: 'numCounters', label: 'Extra Counterattacks', description: 'Grants the affected unit this many additional counterattacks.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'maxOverwatchStrikes', label: 'Max Overwatch Strikes', description: 'Caps how many Overwatch strikes the affected unit can make.', valueKind: 'number', group: 'Abilities & energy' },
  { id: 'disableCounterOnCrit', label: 'Disable Counter on Critical Hit', description: 'The affected unit cannot be countered when it lands a critical hit.', valueKind: 'boolean', group: 'Abilities & energy' },
  { id: 'skipActionChanceModifier', label: 'Skip-Action Chance (%)', description: "Changes the affected unit's chance to skip its action, as a percentage.", valueKind: 'percent', group: 'Abilities & energy' },
  { id: 'anticritChanceModifier', label: 'Anti-Critical Chance (%)', description: "Changes the affected unit's chance to resist a critical hit, as a percentage.", valueKind: 'percent', group: 'Abilities & energy' },

  // Battle behavior
  { id: 'untargetable', label: 'Untargetable', description: 'The affected unit cannot be targeted.', valueKind: 'boolean', group: 'Battle behavior' },
  { id: 'untargetByLowLevel', label: 'Untargetable Below Tier', description: 'The affected unit cannot be targeted by creatures below this tier.', valueKind: 'number', group: 'Battle behavior' },
  { id: 'tauntRadius', label: 'Taunt Radius', description: 'Forces nearby enemy creatures within this radius to target the affected unit.', valueKind: 'number', group: 'Battle behavior' },
  { id: 'ignoreShootingBlock', label: 'Ignore Ranged Attack Restriction', description: 'The affected unit can use ranged attacks even while adjacent to an enemy.', valueKind: 'boolean', group: 'Battle behavior' },
  { id: 'ignoreShootDmgBuff', label: 'Ignore Ranged Damage Penalty', description: 'The affected unit ignores the ranged-damage penalty for shooting at adjacent enemies.', valueKind: 'boolean', group: 'Battle behavior' },
  { id: 'ignoreObstacles', label: 'Ignore Obstacles', description: 'The affected unit can move through battlefield obstacles.', valueKind: 'boolean', group: 'Battle behavior' },
  { id: 'ignoreCastleProtection', label: 'Ignore Castle Wall Protection', description: 'The affected unit ignores the defensive bonus castle walls grant during a siege.', valueKind: 'boolean', group: 'Battle behavior' },
  { id: 'armorPen', label: 'Armor Penetration', description: "Reduces the effectiveness of the target's Defense against this unit's attacks.", valueKind: 'number', group: 'Battle behavior' },
  { id: 'attackPen', label: 'Attack Penetration', description: "Reduces the effectiveness of this unit's own Attack bonuses.", valueKind: 'number', group: 'Battle behavior' },
  { id: 'lifetimeBonus', label: 'Lifetime Bonus', description: 'Extends how long a summoned/temporary unit remains on the battlefield.', valueKind: 'number', group: 'Battle behavior' },

  // Hero modifiers (very rare — confirmed on a single real sub-skill buff)
  { id: 'heroOffenceModifier', label: "Hero's Attack Contribution", description: "Adds this fraction of the hero's own Attack stat to the affected unit.", valueKind: 'number', group: 'Hero modifiers (rare)' },
  { id: 'heroDefenceModifier', label: "Hero's Defense Contribution", description: "Adds this fraction of the hero's own Defense stat to the affected unit.", valueKind: 'number', group: 'Hero modifiers (rare)' },
  { id: 'heroSpellPowerModifier', label: "Hero's Spell Power Contribution", description: "Adds this fraction of the hero's own Spell Power stat to the affected unit.", valueKind: 'number', group: 'Hero modifiers (rare)' },
  { id: 'heroIntelligenceModifier', label: "Hero's Knowledge Contribution", description: "Adds this fraction of the hero's own Knowledge stat to the affected unit.", valueKind: 'number', group: 'Hero modifiers (rare)' },
]

export function buffAttributeById(id: string): BuffAttributeDef | undefined {
  return BUFF_STAT_ATTRIBUTES.find((a) => a.id === id)
}

export function defaultValueForBuffAttr(attr: BuffAttributeDef): string {
  if (attr.valueKind === 'boolean') return 'true'
  if (attr.valueKind === 'percent') return '0.1'
  return '1'
}

// ── Damage-type modifier lists (data.stats.outDmgMods / inDmgMods) ─────────
// Real `t` values span a long, partly bespoke tail (lava_larva_damage,
// decimate_damage, ...) alongside a common core — offered as quick picks,
// but kept as free text (not a closed enum) so nothing real is unreachable.
export const COMMON_DAMAGE_TYPES = [
  'normal_damage', 'melee_attack', 'shoot_attack', 'range_attack', 'counter_attack', 'magic_damage',
]

// ── Duration ─────────────────────────────────────────────────────────────────
// Confirmed distribution across all 414 real buffs: 89 infinite-only, 64
// maxDuration-only, 31 both, 230 neither (mostly `addition: "duration"`
// with no fixed length — the caster's spell/skill determines it instead).
export type DurationMode = 'caster' | 'fixed' | 'infinite'

// ── `addition` — how this buff's effect combines with others of the same id ──
export const ADDITION_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: 'duration', label: 'Refresh duration', description: 'Reapplying this buff resets its remaining duration (the most common real behavior).' },
  { id: 'data', label: 'Stack values', description: "Reapplying this buff adds its values again on top of the existing instance." },
  { id: 'none', label: "Don't reapply", description: 'Reapplying this buff while already active has no additional effect.' },
  { id: 'combined', label: 'Combined', description: 'Reapplying both refreshes duration and stacks values (rare, confirmed on a handful of real buffs).' },
  { id: 'save_old', label: 'Keep original', description: 'Reapplying this buff is ignored — the original instance is kept unchanged (rare).' },
]

// ── immunities[].type — exhaustive across all real buffs ─────────────────────
export const IMMUNITY_TYPE_OPTIONS = ['mechanic', 'effect', 'magic_level', 'ability_rank', 'damage']
