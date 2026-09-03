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
import { DEFAULT_SQUAD_DIFFICULTY_RANGES } from '@/lib/map-grid/squad-pool'

export function buildObjectLogicsIndex(catalog: GameCatalog): Map<string, CatalogObjectLogic> {
  return new Map(catalog.objectLogics.map((logic) => [logic.id, logic]))
}

/**
 * A mine's own real "how strong should this be guarded" figure —
 * `Core/DB/objects_logic/res_mines/mines.json`'s `customGuardValue`
 * (falling back to `aiValue` if absent), confirmed real per-object data:
 * every one of the 6 real mines carries both fields, `customGuardValue`
 * ranging 2000-4000 — squarely inside the Easy..Lethal band every other
 * random-squad guard in this codebase already rolls within (squad-pool.ts).
 * Clamped into that same band so an unusual modded Core.zip's own figures
 * can never produce a value the real value/tier roll tables have never been
 * exercised against (see CLAUDE.md's "hard-won lessons" on requestedValue/
 * tier interdependence — this codebase has been burned by an out-of-band
 * value before). Returns `null` for any sid with no matching objects_logic
 * entry (not a mine, or a mine family this Core.zip doesn't define).
 */
export function mineGuardValue(sid: string, objectLogicsById: Map<string, CatalogObjectLogic>): number | null {
  const raw = objectLogicsById.get(sid)?.raw
  if (!raw) return null
  const value = Number(raw.customGuardValue ?? raw.aiValue)
  if (!Number.isFinite(value) || value <= 0) return null
  const min = DEFAULT_SQUAD_DIFFICULTY_RANGES.find((r) => r.label === 'Easy')?.min ?? 400
  const max = DEFAULT_SQUAD_DIFFICULTY_RANGES.find((r) => r.label === 'Lethal')?.max ?? 16000
  return Math.min(max, Math.max(min, Math.round(value)))
}
