// ─── Map Grid — is a guard sensible for what it protects? ───────────────────
// Works on any open map (hand-made or generated), unlike the RMG quality pass. The reward is the game's own price for the object
// (`interactablePower`, roll-weighted mean of the objects_logic variants); the guard is the summed value of the squads standing at the
// object's entrance tiles (random-squad placeholders from `requestedValue`, squads and objects carrying units from those units). Objects without a
// price (mines, resource piles, decorations) are not judged: the catalog has no number to compare against.
// Evidence (survey of the shipped and test maps in StreamingAssets/maps, Nov 2026): guards are almost always `random-squad` objects (entityType 0,
// 5-500 per map) and only a handful of type-2 squads, which are named templates (`squad_*`) whose army value no file records, so a row with one
// of those is left unjudged (`valueKnown: false`).
// Banks also carry a guard of their own: every objects_logic variant with `guardUnits` (56 of 147 priced event banks, e.g. dragon_utopia) has a
// `customGuardValue`, and the game spawns those units without any squad on the map. That built-in value counts as guard, so a bank with no squad
// beside it is not "unguarded". `custom_*` clones are not judged: their price is a clone's and their guard is the instance's own units.

import i18n from '@/lib/i18n'
import type { MapContext, PlacedObject } from '@/types/map-context'
import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import { interactablePower, powerTier, sizeScale, TIER_MIN_START_DISTANCE, type PowerTier } from '@/lib/rmg/object-power'
import { computeFootprintTiles, guardsAtEntrances } from './footprint'
import { squadValueFromUnits } from './squad-pool'

export interface GuardRewardRow {
  object: PlacedObject
  tier: PowerTier
  guards: PlacedObject[]
  /** Built-in plus outside guard value. */
  guardValue: number
  /** The part of `guardValue` the object brings itself (roll-weighted `customGuardValue`). */
  builtinGuardValue: number
  /** False when a guard is a named squad template, whose army value is not recorded anywhere. */
  valueKnown: boolean
  rewardValue: number
  /** Straight-line tiles to the nearest player start (Infinity without starts). */
  startDistance: number
}

/** Army value of one guard, undefined for a named squad template (no unit counts, so no value). */
export function squadGuardValue(squad: PlacedObject, catalog: GameCatalog | null): number | undefined {
  if (squad.sid === 'random-squad') return squad.randomSquadValue ?? 0
  if (squad.guardUnitProps?.length) return squadValueFromUnits(squad.guardUnitProps, catalog)
  return undefined
}

/** Roll-weighted mean `customGuardValue` over an object's variants, 0 when it has none. */
export function builtinGuardValue(catalog: GameCatalog, sid: string): number {
  const logic = catalog.objectLogics?.find((l) => l.id === sid && l.sourcePath === 'event_banks')
  const variants = ((logic?.raw.variants ?? []) as { rollChance?: number; customGuardValue?: number }[]).filter((v) => typeof v.customGuardValue === 'number')
  const total = variants.reduce((sum, v) => sum + (v.rollChance ?? 1), 0)
  return total > 0 ? variants.reduce((sum, v) => sum + (v.customGuardValue as number) * (v.rollChance ?? 1), 0) / total : 0
}

/** One row per priced interactable on the map, with the guard value standing at its entrances. */
export function guardRewardRows(context: MapContext, catalog: GameCatalog): GuardRewardRow[] {
  const { sizeX, sizeZ, placedObjects } = context
  const templates = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))
  const squads = placedObjects.filter((o) => o.type === 2 || o.sid === 'random-squad')
  const starts = placedObjects.filter((o) => o.type === 0 && o.sid === 'city-spawner')
  const rows: GuardRewardRow[] = []
  for (const object of placedObjects) {
    if (object.type !== 0) continue
    const rewardValue = interactablePower(catalog, object.sid)
    if (rewardValue === undefined || object.sid.startsWith('custom_')) continue
    const cells = computeFootprintTiles(templates.get(object.sid), object.x, object.z, object.rotation)
    const guards = guardsAtEntrances(cells, squads, sizeX, sizeZ)
    const values = guards.map((g) => squadGuardValue(g, catalog))
    const builtin = builtinGuardValue(catalog, object.sid)
    rows.push({
      object,
      tier: powerTier(rewardValue),
      guards,
      guardValue: values.reduce<number>((sum, v) => sum + (v ?? 0), builtin),
      builtinGuardValue: builtin,
      valueKnown: values.every((v) => v !== undefined),
      rewardValue,
      startDistance: starts.reduce((m, s) => Math.min(m, Math.hypot(s.x - object.x, s.z - object.z)), Number.POSITIVE_INFINITY),
    })
  }
  return rows
}

export type GuardRewardKind = 'underGuarded' | 'overGuarded' | 'tooCloseToStart'

export interface GuardRewardMismatch extends GuardRewardRow {
  kind: GuardRewardKind
  /** Guard value the outside squads should add up to ("scale guard"); undefined when a squad does not fix it (too close to a start, or the object's own guard already exceeds it). */
  targetOutsideValue?: number
}

// Guard value / object price over the 13 shipped and test maps with 2+ starts (StreamingAssets/maps, Nov 2026; objects with a known guard value, guarded ones only):
//   tier        no guard   p5     p10    median  p90    p95    max
//   weak free   1157/1837  0.49   0.62   2.45    22.6   40     147
//   medium free  201/343   0.23   0.28   2.00    10     15     30
//   strong free  143/247   0.12   0.15   1.25    4.3    4.95   15.7
//   vStrong free  29/72    0.06   0.07   1.54    3.3    4.0    7.3
//   banks with a built-in guard (all tiers): p5 0.40-0.73, median 0.42-0.87, p95 2.3-22
// Unguarded strong objects are the norm in shipped maps (58% of strong free ones), so "no guard" alone is not flagged. A mismatch is a value outside
// the range the shipped maps use: under = below the strong tiers' p10, over = above each tier's p95. Measured, not verified against play.
const UNDER_GUARDED_BELOW = 0.1
const OVER_GUARDED_ABOVE: Record<PowerTier, number> = { weak: 40, medium: 15, strong: 5, veryStrong: 6 }
/** Guard value / price that "scale guard" aims for: the shipped medians of free rewards. */
const TARGET_RATIO: Record<PowerTier, number> = { weak: 2.45, medium: 2, strong: 1.25, veryStrong: 1.5 }

/** Rows whose guard does not fit the object, worst first is the caller's choice. Rows with a named squad template among the guards are skipped (no value). */
export function findGuardRewardMismatches(context: MapContext, catalog: GameCatalog): GuardRewardMismatch[] {
  const scale = sizeScale(context.sizeX, context.sizeZ)
  const out: GuardRewardMismatch[] = []
  for (const row of guardRewardRows(context, catalog)) {
    if (!row.valueKnown) continue
    const ratio = row.guardValue / row.rewardValue
    const outside = row.guards.length > 0
    // Fixing the guard means changing a squad that stands there, so a kind with no squad to change has no target.
    const target = Math.max(0, Math.round(row.rewardValue * TARGET_RATIO[row.tier] - row.builtinGuardValue))
    if (outside && ratio > OVER_GUARDED_ABOVE[row.tier]) out.push({ ...row, kind: 'overGuarded', targetOutsideValue: target })
    else if (outside && (row.tier === 'strong' || row.tier === 'veryStrong') && ratio < UNDER_GUARDED_BELOW) out.push({ ...row, kind: 'underGuarded', targetOutsideValue: target })
    if ((row.tier === 'strong' || row.tier === 'veryStrong') && row.startDistance < TIER_MIN_START_DISTANCE[row.tier] * scale) out.push({ ...row, kind: 'tooCloseToStart' })
  }
  return out
}

/** A random-squad with 0 never appears in the game; 400 is the Encounter tool's own floor (squad-pool.ts). */
const MIN_SQUAD_VALUE = 400

/** The edit behind "scale guard": the strongest random-squad guard takes the value that brings the outside total to the target. Fixed squads need a unit choice, so a mismatch guarded only by those has none. */
export function scaleGuardEdit(mismatch: GuardRewardMismatch, catalog: GameCatalog | null): { entityType: 0; entityId: number; requestedValue: number } | null {
  if (mismatch.targetOutsideValue === undefined) return null
  const randoms = mismatch.guards.filter((g) => g.sid === 'random-squad')
  if (randoms.length === 0) return null
  const main = randoms.reduce((a, b) => ((b.randomSquadValue ?? 0) > (a.randomSquadValue ?? 0) ? b : a))
  const others = mismatch.guards.filter((g) => g !== main).reduce((sum, g) => sum + (squadGuardValue(g, catalog) ?? 0), 0)
  return { entityType: 0, entityId: main.id, requestedValue: Math.max(MIN_SQUAD_VALUE, Math.round(mismatch.targetOutsideValue - others)) }
}

export function describeGuardRewardMismatch(m: GuardRewardMismatch): string {
  const where = i18n.t('validate.map.where', { sid: m.object.sid, id: m.object.id, x: m.object.x, z: m.object.z })
  const guard = Math.round(m.guardValue)
  const reward = Math.round(m.rewardValue)
  if (m.kind === 'underGuarded') return i18n.t('validate.map.guardUnder', { where, guard, reward, pct: Math.round((guard / reward) * 100) })
  if (m.kind === 'overGuarded') return i18n.t('validate.map.guardOver', { where, guard, reward, times: (guard / reward).toFixed(1) })
  return i18n.t('validate.map.guardNearStart', { where, distance: Math.round(m.startDistance) })
}
