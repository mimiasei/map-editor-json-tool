// ─── RMG-only real terrain tile-adjacency weights (issue #224) ─────────────
// Derived from scripts/derive-terrain-adjacency-stats.ts against every real
// hand-crafted OE map under maps/ (every direct-child .map file except
// TheQuest.map/Stormlight.map — see plans/rmg-ml-research-issue.md). Last
// refreshed 2026-09-28 against 18 real maps (12 of the original + 6 newly
// added, same corpus growth as decoration-calibration.ts) — re-run the
// script and update these numbers whenever the corpus grows again. 4-
// directional biome-pair adjacency counts, symmetrized (a-next-to-b counted
// the same as b-next-to-a). Every biome pair was observed adjacent at least
// once somewhere in the corpus (18 maps × up to 102,400 tiles each gives
// enough incidental cross-zone borders that no pair is truly absent) — so
// this doesn't hard-exclude any pair, it only weights how RARE an unusual
// pairing should be relative to a biome sitting next to itself (which
// dominates every row by 1-2 orders of magnitude, as expected — most tiles
// are deep inside one zone, not at a border). Cross-checked against issue
// #230's own analyze-map-aesthetics.ts: Grass's own cross-biome borders
// split 77% Sand/Autumn/Dirt vs. 23% Deathland/Snow/Lava — a real,
// meaningful concentration (vs. ~50% under a uniform null) that directly
// confirms fuzzy-obstacle.ts's `COMPATIBLE_BIOME_CLUSTERS` judgment call,
// previously "not confirmed against anything."
//
// Biome ids match RawMapBlock2's tilesMap convention (1=Grass, 2=Sand,
// 3=Deathland, 4=Snow, 5=Autumn, 6=Lava, 7=Dirt — see CLAUDE.md).
export const TILE_ADJACENCY_WEIGHTS: Record<number, Record<number, number>> = {
  1: { 1: 355108, 2: 5446, 3: 1974, 4: 1634, 5: 4072, 6: 975, 7: 5875 },
  2: { 1: 5446, 2: 164848, 3: 533, 4: 710, 5: 835, 6: 701, 7: 1161 },
  3: { 1: 1974, 2: 533, 3: 143596, 4: 685, 5: 1328, 6: 867, 7: 2573 },
  4: { 1: 1634, 2: 710, 3: 685, 4: 150340, 5: 941, 6: 416, 7: 1184 },
  5: { 1: 4072, 2: 835, 3: 1328, 4: 941, 5: 144300, 6: 1330, 7: 1337 },
  6: { 1: 975, 2: 701, 3: 867, 4: 416, 5: 1330, 6: 93192, 7: 1364 },
  7: { 1: 5875, 2: 1161, 3: 2573, 4: 1184, 5: 1337, 6: 1364, 7: 136798 },
}
