// ─── RMG-only guard value bands ──────────────────────────────────────────────
// Calibrated against real, shipped, hand-crafted maps (maps/Broken_Alliance.map,
// maps/Prisoners.map, maps/The_Mysterious_Island.map — a real analysis pass,
// not a guess): random-squad.requestedValue across those three maps ranges
// min 3000-4000, median 12000-25000, max 50000-350000 — vastly above
// squad-pool.ts's own DEFAULT_SQUAD_DIFFICULTY_RANGES (tops out at 16000 for
// "Lethal"), which is shared with the manual Encounter brush tool and is left
// untouched here on purpose (recalibrating it would also change that
// unrelated tool's own UI/behavior). This is the RMG's OWN table, used only
// by its 3 guard-placement call sites (zone-population.ts, zone-boundary.ts,
// zone-guard-scatter.ts) via `pickSquadRange`/`randomInRange`
// (squad-pool.ts) — both already take ranges/weights as parameters, so no
// changes were needed there.
//
// `Easy` is deliberately UNCHANGED from squad-pool.ts's own band (400-2000):
// it's the near-player-start floor (zone-guard-scatter.ts's
// `difficultyLabelsForDepth`, depth<=0), and none of the three real maps'
// own minimum guard value is necessarily right next to a player spawn — a
// gentle start is a distinct design intent from "guards are generally
// stronger than we thought", not something the real-map data contradicts.
//
// The higher bands compose with zone-boundary.ts's own DIFFICULTY_MULTIPLIER
// (`strong`: 1.5, `'very strong'`: 2.5) unchanged, so a `'very strong'` gate
// guard at `Lethal` can reach up to 375000 — matching the real observed max
// (350000) almost exactly.
import type { DifficultyRange, DifficultyWeight } from '@/lib/map-grid/squad-pool'

export const RMG_GUARD_DIFFICULTY_RANGES: DifficultyRange[] = [
  { label: 'Random', min: 400, max: 150000 },
  { label: 'Easy', min: 400, max: 2000 },
  { label: 'Normal', min: 2000, max: 8000 },
  { label: 'Difficult', min: 8000, max: 20000 },
  { label: 'Impossible', min: 20000, max: 50000 },
  { label: 'Lethal', min: 50000, max: 150000 },
]

/** squad-pool.ts's own `DEFAULT_SQUAD_RANDOM_WEIGHTS` (40/25/20/10/5) was
 *  tuned against the OLD, much-narrower 400-16000 span, where that skew
 *  toward Easy/Normal still landed a "typical" roll in the low thousands —
 *  reusing it unchanged against the wider bands above pulled the overall
 *  rolled median down to ~1500-3000 in a real regeneration test, nowhere
 *  near the real maps' own 12000-25000 median. Re-weighted so roughly half
 *  of all 'Random' rolls land at Difficult or below and half at Impossible
 *  or above — empirically verified (via this session's own regeneration/
 *  stats script) to produce a median in the ~15000-20000 range, matching
 *  the real maps' own observed median band. */
export const RMG_GUARD_RANDOM_WEIGHTS: DifficultyWeight[] = [
  { label: 'Easy', weight: 10 },
  { label: 'Normal', weight: 15 },
  { label: 'Difficult', weight: 25 },
  { label: 'Impossible', weight: 30 },
  { label: 'Lethal', weight: 20 },
]

/** Real hand-crafted maps place ZERO concrete `squads[]` armies as guards —
 *  all three analyzed maps use `random-squad` placeholders exclusively
 *  (72-337 guards each). A concrete army is also structurally unable to
 *  represent the top of the real value range anyway (`pickSquadTemplate`'s
 *  own `nearestTier` clamps to tier 7's median, nowhere near 150000+), so a
 *  concrete-squad roll for a GUARD specifically is scaled down hard rather
 *  than removed outright (an earlier explicit user request added object
 *  variety for guards too, so keep it possible, just rare). Treasure/
 *  resource/artifact placements are unaffected — real maps do mix in
 *  concrete objects there. */
export const GUARD_CONCRETE_SQUAD_CHANCE_SCALE = 0.1

/** Olden Era's own real RMG templates (`maps/templates/*.rmg.json`) have a
 *  per-zone `guardCutoffValue` (1500-2500 seen) below which a candidate
 *  simply goes unguarded rather than rolling a near-worthless guard — a
 *  mechanic this generator had no equivalent of before. NOT ported at that
 *  same absolute number, though: real templates' cutoff prunes THEIR OWN
 *  lowest content tier, which can resolve far below 1500; our own `Easy`
 *  band already has a deliberately-tuned floor of 400 (squad-pool.ts's own
 *  doc comment: `requestedValue:0` makes a guard invisible in-game, 400 is
 *  the chosen safe minimum) — a real regeneration/stats pass this session
 *  confirmed that reusing the real templates' own 1500 here gutted this
 *  generator's own already-tuned near-player-start guard coverage (Easy's
 *  400-2000 band mostly falls under 1500, so most Easy rolls got silently
 *  skipped instead of a genuine minority). Set to 400 instead — Easy's own
 *  floor — so this stays a true defensive floor (never fires against a
 *  normal difficulty-band roll) while still meaningfully pruning
 *  `zone-population.ts`'s player-zone guard once `PLAYER_ZONE_GUARD_
 *  MULTIPLIER` softens it (some of that softened range now genuinely dips
 *  below 400, a real minority-skip, not a near-total one). Applied at every
 *  guard-placement call site (zone-population.ts, zone-guard-scatter.ts) —
 *  not zone-boundary.ts's mandatory gate guards, which already floor at
 *  `Impossible` (20000+) and so never dip this low anyway. */
export const GUARD_VALUE_CUTOFF = 400

/** Real templates also show a per-zone-role `guardMultiplier` (spawn zones
 *  0.5-0.84, treasure/center zones 1.2-2.0) applied on top of a guard's
 *  base rolled value. Only the player-zone softening half is adopted here
 *  (0.7, mid-range of the real spawn-zone values) — neutral/treasure zones
 *  are deliberately left unscaled since their guard values were already
 *  carefully calibrated against real maps' own median/max last session
 *  (see `value-model.ts`'s `MINE_GUARD_VALUE_SCALE`); adding a second
 *  multiplier on top risked re-breaking that tuning for an untested gain. */
export const PLAYER_ZONE_GUARD_MULTIPLIER = 0.7
