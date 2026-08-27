// ─── Map grid — random-squad "Encounter" brush + Browse-mode difficulty picker ─
// Shared between the Encounter paint tool (MapGridDialog.tsx), the
// Browse-mode Value editor (MapGridCellContent.tsx), and the Map Grid
// settings popover's Advanced section (MapGridSettingsDialog.tsx) — issue
// #203. DEFAULT_SQUAD_DIFFICULTY_RANGES/DEFAULT_SQUAD_RANDOM_WEIGHTS below
// are only the seed values for MapGridSettings (localStorage) — every
// function here takes the live (possibly user-edited) ranges/weights as a
// parameter rather than reading these constants directly, so a customized
// value actually takes effect everywhere.

import type { BiomeId } from './terrain-colors'

export interface DifficultyRange { label: string; min: number; max: number }
export interface DifficultyWeight { label: string; weight: number }

/** Labels match the game's own scenario-difficulty naming (Easy/Normal/
 *  Difficult/Impossible/Lethal — see plans/mapmaking_guide_en_noMapEditor.md's
 *  Difficulty condition docs) applied to a random-squad's requestedValue.
 *  Driven by the (possibly user-customized) ranges rather than hardcoded
 *  thresholds, so the Browse-mode Value field's badge stays consistent with
 *  whatever boundaries Advanced settings has set. */
export function randomSquadDifficultyLabel(value: number, ranges: DifficultyRange[] = DEFAULT_SQUAD_DIFFICULTY_RANGES): string {
  const named = ranges.filter((r) => r.label !== 'Random')
  return (named.find((r) => value <= r.max) ?? named[named.length - 1] ?? ranges[0]).label
}

/** Default ranges for the difficulty quick-pick buttons/Encounter tool
 *  setting. Easy floors at 400, not 0 — requestedValue:0 makes a
 *  random-squad invisible in-game (see randomSquadDefaultValue's doc
 *  comment in map-write.ts), and 400 is a user-picked floor above that (250
 *  rolled too weak). Lethal has no documented real ceiling above 8000;
 *  16000 is just a reasonable cap for this convenience roll. `Random` spans
 *  the same overall band flat, rather than being a 6th disjoint bracket —
 *  issue #203's own spec (500-15000, rounded to the nearest existing
 *  boundary either side) — though pickSquadRange's weighted picking is what
 *  actually drives it now, not a flat roll across this range. */
export const DEFAULT_SQUAD_DIFFICULTY_RANGES: DifficultyRange[] = [
  { label: 'Random', min: 500, max: 15000 },
  { label: 'Easy', min: 400, max: 2000 },
  { label: 'Normal', min: 2001, max: 4000 },
  { label: 'Difficult', min: 4001, max: 6000 },
  { label: 'Impossible', min: 6001, max: 8000 },
  { label: 'Lethal', min: 8001, max: 16000 },
]

/** Default weighting for the `Random` option specifically — a flat roll
 *  across Random's own 500-15000 span gave Lethal (8001-15000 of that span,
 *  ~48%) a wildly disproportionate chance compared to how rare a Lethal
 *  encounter should feel scattered across a map. User-tuned, not derived
 *  from any game data — editable in Advanced settings. */
export const DEFAULT_SQUAD_RANDOM_WEIGHTS: DifficultyWeight[] = [
  { label: 'Easy', weight: 40 },
  { label: 'Normal', weight: 25 },
  { label: 'Difficult', weight: 20 },
  { label: 'Impossible', weight: 10 },
  { label: 'Lethal', weight: 5 },
]

/** A bell-curve roll within [min, max], not a flat one — a plain uniform
 *  roll landed on the low end of a range (e.g. near Easy's 250 floor) just
 *  as often as its middle, which read as biased-low even though it wasn't
 *  (user-requested fix). Averaging 3 independent uniform draws (Irwin-Hall)
 *  clusters results around the midpoint with tapering tails at both ends —
 *  cheap, bounded, no rejection sampling needed. */
export function randomInRange(min: number, max: number, rng: () => number = Math.random): number {
  const u = (rng() + rng() + rng()) / 3
  return min + Math.round(u * (max - min))
}

/** Encounter tool only — multiple difficulties can be enabled at once (each
 *  placement picks one of the enabled labels at random, then rolls within
 *  its range), so one drag stroke can mix e.g. Easy and Lethal guards.
 *  `Random` is mutually exclusive with the rest (enforced by the caller
 *  that builds this array, not here) and picks a weighted bucket instead of
 *  a flat roll across its own range — see `weights`' own doc comment
 *  (DEFAULT_SQUAD_RANDOM_WEIGHTS). Falls back to Easy if a customized
 *  ranges/weights set is missing an entry (shouldn't happen — the settings
 *  UI always edits a full copy — but this file's own convention throughout
 *  is to degrade gracefully rather than throw on missing data). */
export function pickSquadRange(
  enabledLabels: string[],
  ranges: DifficultyRange[] = DEFAULT_SQUAD_DIFFICULTY_RANGES,
  weights: DifficultyWeight[] = DEFAULT_SQUAD_RANDOM_WEIGHTS,
  rng: () => number = Math.random,
): DifficultyRange {
  const find = (label: string) => ranges.find((r) => r.label === label)
  if (enabledLabels.includes('Random')) {
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
    let roll = rng() * totalWeight
    for (const { label, weight } of weights) {
      if (roll < weight) return find(label) ?? ranges[0]
      roll -= weight
    }
    return find('Easy') ?? ranges[0]
  }
  const label = enabledLabels[Math.floor(rng() * enabledLabels.length)] ?? 'Easy'
  return find(label) ?? ranges[0]
}

/** Faction id a random-squad's `fraction` field resolves to when its owning
 *  tile's biome should determine "who's guarding this" — confirmed real
 *  data (Core/DB/fractions/*.json, same mapping as the rest of this
 *  codebase's biome logic): human->Grass, undead->Deathland, dungeon->Dirt,
 *  nature->Autumn, demon->Lava, unfrozen->Snow. Sand/Desert (biome 2) is
 *  intentionally absent — no faction natively occupies it. */
const BIOME_FACTION: Partial<Record<BiomeId, string>> = {
  1: 'human',
  3: 'undead',
  4: 'unfrozen',
  5: 'nature',
  6: 'demon',
  7: 'dungeon',
}

const ALL_FRACTIONS = ['human', 'undead', 'dungeon', 'nature', 'demon', 'unfrozen', 'neutral', '']

/** Picks a `propRandomSquads.fraction` value for a tile of the given biome —
 *  confirmed against real shipped maps that this field is real, load-bearing
 *  data (62% of 1039 sampled propRandomSquads rows set a specific faction,
 *  independent of requestedValue/tier), not previously written by any path
 *  in this codebase. `biomePurity` follows the same 0-1 semantics as the
 *  Obstacles/Trees/Landmark brushes' slider: 1 always picks the tile's own
 *  matching faction, 0 picks uniformly among every other option including
 *  '' (no faction/random) and 'neutral'. */
export function sampleFraction(ownBiome: BiomeId, biomePurity: number, rng: () => number = Math.random): string {
  const ownFaction = BIOME_FACTION[ownBiome] ?? ''
  if (rng() < biomePurity) return ownFaction
  const others = ALL_FRACTIONS.filter((f) => f !== ownFaction)
  return others[Math.floor(rng() * others.length)]
}
