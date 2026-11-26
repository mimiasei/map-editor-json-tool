// ─── H3 victory condition → OE win conditions ────────────────────────────────
// An H3 map's victory condition (header: one special condition, plus a flag saying whether the normal "defeat everyone" victory still
// counts) maps onto the win conditions of the OE map settings (`settings.mapWinConditions`, rmg/win-conditions.ts) where OE has a similar one:
//
//   standard victory (WINSTANDARD, or the "allow normal victory" flag)  -> Classic
//   capture a given town (CAPTURECITY)                                  -> Capital Hold when that town is a player's start city,
//                                                                          City Hold (the town is marked) when it is neutral
//   defeat a given hero (BEATHERO)                                      -> Guardian's Demise (OE picks the hero, so this is the
//                                                                          nearest match, not the same rule)
//
// Held for 1 day, the shortest OE offers: H3 wins the moment the town is taken. Every other H3 type (gather troops or resources, build a
// grail or a city, find an artifact, take every mine or dwelling, survive N days ...) has no OE counterpart. A map that cannot be won is
// worse than one with a plain rule, so it falls back to Classic, and the import report names what was dropped.

import type { H3mVictoryCondition } from './h3m-format'
import {
  VICTORY_ARTIFACT, VICTORY_GATHERTROOP, VICTORY_GATHERRESOURCE, VICTORY_BUILDCITY, VICTORY_BUILDGRAIL, VICTORY_BEATHERO, VICTORY_CAPTURECITY,
  VICTORY_BEATMONSTER, VICTORY_TAKEDWELLINGS, VICTORY_TAKEMINES, VICTORY_TRANSPORTITEM, VICTORY_DEFEAT_ALL_MONSTERS, VICTORY_SURVIVE_TIME, VICTORY_WINSTANDARD,
} from './h3m-format'
import { DEFAULT_WIN_OPTIONS, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'

const H3_VICTORY_NAMES: Record<number, string> = {
  [VICTORY_ARTIFACT]: 'Acquire a specific artifact',
  [VICTORY_GATHERTROOP]: 'Accumulate creatures',
  [VICTORY_GATHERRESOURCE]: 'Accumulate resources',
  [VICTORY_BUILDCITY]: 'Upgrade a specific town',
  [VICTORY_BUILDGRAIL]: 'Build a grail structure',
  [VICTORY_BEATHERO]: 'Defeat a specific hero',
  [VICTORY_CAPTURECITY]: 'Capture a specific town',
  [VICTORY_BEATMONSTER]: 'Defeat a specific monster',
  [VICTORY_TAKEDWELLINGS]: 'Flag all creature dwellings',
  [VICTORY_TAKEMINES]: 'Flag all mines',
  [VICTORY_TRANSPORTITEM]: 'Transport a specific artifact',
  [VICTORY_DEFEAT_ALL_MONSTERS]: 'Defeat all monsters',
  [VICTORY_SURVIVE_TIME]: 'Survive for a time',
}

export interface H3WinPlan {
  /** The OE conditions the map gets, in the editor's order. */
  ids: WinConditionId[]
  /** Source position (x, y, z) of the town to capture, when the H3 map asks for one; the caller decides Capital Hold or City Hold. */
  captureCity: { x: number; y: number; z: number } | null
  /** Name of an H3 victory type with no OE counterpart that was dropped, or null. */
  unsupported: string | null
}

function readPosition(special: Record<string, unknown>): { x: number; y: number; z: number } | null {
  const p = special.position as { x?: number; y?: number; z?: number } | undefined
  return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y, z: p.z ?? 0 } : null
}

/** What the H3 victory condition becomes before the town it names is looked up (see `finishH3WinPlan`). */
export function planH3WinConditions(victory: H3mVictoryCondition): H3WinPlan {
  if (victory.type === VICTORY_WINSTANDARD) return { ids: ['classic'], captureCity: null, unsupported: null }
  const classic = victory.allowNormalVictory === true
  if (victory.type === VICTORY_BEATHERO) return { ids: classic ? ['classic', 'guardians-demise'] : ['guardians-demise'], captureCity: null, unsupported: null }
  if (victory.type === VICTORY_CAPTURECITY) {
    const position = readPosition(victory.special)
    if (position) return { ids: classic ? ['classic'] : [], captureCity: position, unsupported: null }
  }
  return { ids: ['classic'], captureCity: null, unsupported: H3_VICTORY_NAMES[victory.type] ?? `H3 victory type ${victory.type}` }
}

/** Adds the condition for the captured town once the converter knows what that town became: `ownedByPlayer` (a start city) gives Capital Hold,
 *  a neutral town gives City Hold; a town that was not converted drops the condition (named in `unsupported`). */
export function finishH3WinPlan(plan: H3WinPlan, town: 'player' | 'neutral' | 'missing'): H3WinPlan {
  if (!plan.captureCity) return plan
  if (town === 'missing') {
    return { ...plan, ids: plan.ids.length > 0 ? plan.ids : ['classic'], unsupported: H3_VICTORY_NAMES[VICTORY_CAPTURECITY] }
  }
  return { ...plan, ids: [...plan.ids, town === 'player' ? 'capital-hold' : 'city-hold'] }
}

/** Held for one day: H3 wins the moment the town is taken. */
export const H3_WIN_OPTIONS: WinOptions = { ...DEFAULT_WIN_OPTIONS, capitalHoldDays: 1, cityHoldDays: 1 }
