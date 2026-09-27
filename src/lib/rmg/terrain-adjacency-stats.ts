// ─── RMG-only real terrain tile-adjacency weights (issue #224) ─────────────
// Derived from scripts/derive-terrain-adjacency-stats.ts against all 12 real
// hand-crafted OE maps under maps/ (every direct-child .map file except
// TheQuest.map/Stormlight.map — see plans/rmg-ml-research-issue.md). 4-
// directional biome-pair adjacency counts, symmetrized (a-next-to-b counted
// the same as b-next-to-a). Every biome pair was observed adjacent at least
// once somewhere in the corpus (12 maps × up to 65,536 tiles each gives
// enough incidental cross-zone borders that no pair is truly absent) — so
// this doesn't hard-exclude any pair, it only weights how RARE an unusual
// pairing should be relative to a biome sitting next to itself (which
// dominates every row by 1-2 orders of magnitude, as expected — most tiles
// are deep inside one zone, not at a border).
//
// Biome ids match RawMapBlock2's tilesMap convention (1=Grass, 2=Sand,
// 3=Deathland, 4=Snow, 5=Autumn, 6=Lava, 7=Dirt — see CLAUDE.md).
export const TILE_ADJACENCY_WEIGHTS: Record<number, Record<number, number>> = {
  1: { 1: 224862, 2: 3651, 3: 1519, 4: 1021, 5: 3407, 6: 752, 7: 5117 },
  2: { 1: 3651, 2: 20244, 3: 77, 4: 67, 5: 288, 6: 392, 7: 836 },
  3: { 1: 1519, 2: 77, 3: 25380, 4: 664, 5: 1090, 6: 604, 7: 2087 },
  4: { 1: 1021, 2: 67, 3: 664, 4: 37750, 5: 479, 6: 380, 7: 979 },
  5: { 1: 3407, 2: 288, 3: 1090, 4: 479, 5: 31012, 6: 1280, 7: 1156 },
  6: { 1: 752, 2: 392, 3: 604, 4: 380, 5: 1280, 6: 16856, 7: 1106 },
  7: { 1: 5117, 2: 836, 3: 2087, 4: 979, 5: 1156, 6: 1106, 7: 38728 },
}
