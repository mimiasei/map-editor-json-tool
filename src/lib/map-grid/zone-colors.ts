// ─── Player Areas — zone id → color palette ──────────────────────────────────
// Purely an editor-UI choice (no color data exists in the .map format for
// this — same situation as terrain-colors.ts's biome/road/river swatches).
// Chosen distinct from every other color already on the Map Grid canvas
// (BIOME_BASE_COLORS, WATER_BASE_COLOR, ROAD_BASE_COLORS, RIVER_BASE_COLOR,
// GROUP_COLORS in MapGridDialog.tsx) so a painted zone reads as its own
// feature regardless of what terrain/objects sit under it.

export const ZONE_COLORS: string[] = [
  '#e63946', // red
  '#ffb703', // amber
  '#06d6a0', // teal-green
  '#8338ec', // violet
  '#fb5607', // orange
  '#3a86ff', // blue
  '#ff006e', // magenta
  '#adb5bd', // neutral gray
]

/** Zone id 0 means unpainted and is never rendered — only ids 1+ index in. */
export function colorForZone(zoneId: number): string {
  return ZONE_COLORS[(zoneId - 1) % ZONE_COLORS.length]
}
