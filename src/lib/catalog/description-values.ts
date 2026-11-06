// ─── Numbers for the {0}/{1} placeholders in map object descriptions ─────────
// mapObjects.json texts such as "Gives the first visiting hero {0} XP." leave the number to the game. The numbers are in
// Core.zip: DB/objects_logic (variants' rewards and costs; mines' resValue; resource piles' resArr; barracks' bonuses) and,
// for buffs, DB/heroes_buffs. A number that differs between variants (lost_library: 6000, 8000 or 10000 XP) becomes a range.
// Checked against the real files, Nov 2026. Placeholders whose meaning the data does not show are left as they are:
// altar_of_magic_* ("pick {0} out of {1}": three rewards with 1-5 spell chances), monty_hall ("{0} among {1}"), the skill count of
// university/infernal_cirque, insaras_eye and mercenary_guild.

type Kind = 'xp' | 'gold' | 'res' | 'stat' | 'cost' | 'move' | 'movePct' | 'manaPct' | 'buff' | 'mine' | 'pile' | 'barracks'

/** Which quantity each placeholder index of a description stands for. `byOccurrence` is for a text that reuses one index twice. */
interface SlotSpec { byIndex?: (Kind | null)[]; byOccurrence?: Kind[] }

const SLOTS: Record<string, SlotSpec> = {
  chest: { byIndex: ['gold'] },
  learning_stone: { byIndex: ['xp'] },
  lost_library: { byIndex: ['xp'] },
  fountain: { byIndex: ['move'] },
  huntsmans_camp: { byIndex: ['movePct', 'manaPct'] },
  // The text says "{0}%" twice; the data gives 30% movement restored and a buff of +20%.
  stables: { byOccurrence: ['movePct', 'buff'] },
  beer_fountain: { byIndex: ['buff'] },
  mysterious_stone: { byIndex: ['buff'] },
  pile_of_books: { byIndex: ['buff'] },
  quixs_path: { byIndex: ['buff'] },
  mystical_tower: { byIndex: ['res'] },
  armory_automaton: { byIndex: ['stat'] },
  knowledge_garden: { byIndex: ['stat'] },
  magic_wheel: { byIndex: ['stat'] },
  stinging_sword: { byIndex: ['stat'] },
  maze: { byIndex: ['stat'] },
  trial_scales: { byIndex: ['stat'] },
  fort: { byIndex: ['stat', 'cost'] },
  orb_observatory: { byIndex: ['stat', 'cost'] },
  college_of_wonder: { byIndex: ['stat', 'cost'] },
  university: { byIndex: [null, 'cost'] },
}
for (const resource of ['crystals', 'dust', 'gemstones', 'gold', 'mercury', 'ore', 'wood']) SLOTS[`storage_${resource}`] = { byIndex: ['res'] }

function slotsFor(sid: string): SlotSpec | undefined {
  if (SLOTS[sid]) return SLOTS[sid]
  if (sid.startsWith('mine_')) return { byIndex: ['mine'] }
  if (sid.startsWith('resource_')) return { byIndex: ['pile'] }
  if (sid.startsWith('barracks_')) return { byIndex: ['barracks'] }
  return undefined
}

type Json = Record<string, unknown>
const asArray = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : [])
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
const params = (r: Json): unknown[] => (Array.isArray(r.parameters) ? r.parameters : [])

/** HeroBuffReward stat bonuses that the game shows as percentages (heroes_buffs.json stores 0.25 for +25%). */
const PERCENT_BUFF_STATS = new Set(['expPerBonus', 'manaBonusPercent', 'movementPerBonus'])

/** All numbers a logic entry has for one kind, over every variant and reward (a range collapses to min/max later). */
function quantities(kind: Kind, logic: Json, heroBuffs: Map<string, Json>): number[] {
  const out: number[] = []
  const push = (v: number | undefined, scale = 1): void => { if (v !== undefined) out.push(Math.round(v * scale * 1000) / 1000) }
  if (kind === 'mine') push(num(logic.resValue))
  if (kind === 'pile') for (const r of asArray(logic.resArr)) for (const v of Array.isArray(r.values) ? r.values : []) push(num(v))
  if (kind === 'barracks') for (const b of asArray(logic.bonuses)) if (b.type === 'cityUnitsIncrementFromBarrack') push(num(params(b)[1]))
  for (const variant of asArray(logic.variants)) {
    const set = (variant.rewardSet ?? {}) as Json
    if (kind === 'cost') for (const c of asArray(set.rewardCost)) push(num(c.cost))
    for (const reward of asArray(set.rewards)) {
      const p = params(reward)
      switch (reward.rewardType) {
        case 'HeroExpReward': if (kind === 'xp') push(num(p[0])); break
        case 'SideResReward': if (kind === 'res' || (kind === 'gold' && p[0] === 'gold')) push(num(p[1])); break
        case 'HeroStatsReward': if (kind === 'stat') for (let i = 1; i < p.length; i += 2) push(num(p[i])); break
        case 'MovePointsAdditionReward': if (kind === 'move') push(num(p[0])); break
        case 'MovePointsPercentAdditionReward': if (kind === 'movePct') push(num(p[0]), 100); break
        case 'ManaPercentAdditionReward': if (kind === 'manaPct') push(num(p[0]), 100); break
        case 'HeroBuffReward':
          if (kind === 'buff') {
            for (const bonus of asArray(heroBuffs.get(String(p[0]))?.bonuses)) {
              const [stat, amount] = params(bonus)
              push(num(amount), PERCENT_BUFF_STATS.has(String(stat)) ? 100 : 1)
            }
          }
          break
      }
    }
  }
  return out
}

function formatRange(values: number[]): string | undefined {
  if (values.length === 0) return undefined
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return lo === hi ? String(lo) : `${lo}-${hi}`
}

/** `description` with its {n} placeholders replaced by the numbers in `logic` (the object's objects_logic entry); unknown ones stay. */
export function fillDescriptionPlaceholders(description: string, sid: string, logic: Json | undefined, heroBuffs: Map<string, Json>): string {
  const spec = slotsFor(sid)
  if (!spec || !logic || !/\{\d\}/.test(description)) return description
  const cache = new Map<Kind, string | undefined>()
  const valueOf = (kind: Kind | null | undefined): string | undefined => {
    if (!kind) return undefined
    if (!cache.has(kind)) cache.set(kind, formatRange(quantities(kind, logic, heroBuffs)))
    return cache.get(kind)
  }
  let occurrence = 0
  return description.replace(/\{(\d)\}/g, (match, index: string) => {
    const kind = spec.byOccurrence ? spec.byOccurrence[occurrence] : spec.byIndex?.[Number(index)]
    occurrence++
    return valueOf(kind) ?? match
  })
}
