// ─── RMG value-budget model (issue #210, Milestone 2) ───────────────────────
// The generalized "how much is this actually worth" model issue #210's own
// research flagged as missing: `squadValue`/`tier` is well modeled for
// creatures already (GameCatalog.creatures), but a mine's own real economic
// value only ever lived in raw Core/DB/objects_logic/*.json data, never on
// a typed, RMG-queryable surface. This starts with mines specifically —
// the one object family with real per-object guard-value data GME/the game
// itself already uses — rather than inventing a synthetic value for
// everything at once.

import type { CatalogObjectLogic, GameCatalog } from '@/lib/catalog/types'
import { RMG_GUARD_DIFFICULTY_RANGES } from './guard-value-bands'

export function buildObjectLogicsIndex(catalog: GameCatalog): Map<string, CatalogObjectLogic> {
  return new Map(catalog.objectLogics.map((logic) => [logic.id, logic]))
}

/** Real `customGuardValue`/`aiValue` (2000-4000 across all 6 real mines,
 *  `Core/DB/objects_logic/res_mines/mines.json`) is the game's own suggested
 *  "how strong should this be guarded" figure — but a real regeneration/
 *  stats verification pass this session found that using it verbatim
 *  (even after widening the clamp to `RMG_GUARD_DIFFICULTY_RANGES`) still
 *  produced an overall guard-value median around 1500-3000, nowhere near
 *  real hand-crafted maps' own 12000-25000 median (guard-value-bands.ts's
 *  own doc comment has the full real-map data): mine guards are common
 *  enough (one per neutral zone) that their own low raw value dominates the
 *  map-wide median by sheer volume, regardless of how high the rarer
 *  boundary-gate/proximity guards go — worse yet on a small/low-player-count
 *  map, where a real map (Prisoners.map, 64x64/2p) still hits a 16000
 *  median despite having few zones. `MINE_GUARD_VALUE_SCALE` (10x) projects
 *  the real 2000-4000 range up to ~20000-40000 — landing inside the real
 *  median band even on a small map's own thinner zone population, while
 *  preserving the real DATA's own relative economic ordering (a gold mine
 *  still ends up defended harder than a wood mine). */
const MINE_GUARD_VALUE_SCALE = 10

/**
 * A mine's own "how strong should this be guarded" figure, scaled from the
 * real game data (see `MINE_GUARD_VALUE_SCALE`'s own doc comment) and
 * clamped into `RMG_GUARD_DIFFICULTY_RANGES` so an unusual modded Core.zip's
 * own figures can never produce a value the real value/tier roll tables
 * have never been exercised against (see CLAUDE.md's "hard-won lessons" on
 * requestedValue/tier interdependence — this codebase has been burned by an
 * out-of-band value before). Returns `null` for any sid with no matching
 * objects_logic entry (not a mine, or a mine family this Core.zip doesn't
 * define).
 */
export function mineGuardValue(sid: string, objectLogicsById: Map<string, CatalogObjectLogic>): number | null {
  const raw = objectLogicsById.get(sid)?.raw
  if (!raw) return null
  const value = Number(raw.customGuardValue ?? raw.aiValue)
  if (!Number.isFinite(value) || value <= 0) return null
  const min = RMG_GUARD_DIFFICULTY_RANGES.find((r) => r.label === 'Easy')?.min ?? 400
  const max = RMG_GUARD_DIFFICULTY_RANGES.find((r) => r.label === 'Lethal')?.max ?? 150000
  return Math.min(max, Math.max(min, Math.round(value * MINE_GUARD_VALUE_SCALE)))
}
