// ─── H3M terrain tile decode ──────────────────────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator),
// used with the author's explicit permission. 7 bytes per tile, row-major grid
// with X fastest-varying — H3's own native top-left-origin convention (see
// atlas.ts for the flip into OE's bottom-left convention).

export interface H3mTile {
  terrain: number
  terrainSprite: number
  river: number
  riverSprite: number
  road: number
  roadSprite: number
  mirror: number
}

/** Decode one H3 layer's (`size`×`size`) terrain tiles starting at
 *  `layerStart` in the decompressed file. Throws if a water tile (terrain
 *  id 8) carries a river overlay — a real invariant violation, not a
 *  cosmetic oddity, confirmed by the reference project. */
export function decodeH3mLayerTiles(data: Uint8Array, layerStart: number, size: number): H3mTile[] {
  const tiles: H3mTile[] = []
  const tileCount = size * size
  for (let i = 0; i < tileCount; i++) {
    const pos = layerStart + i * 7
    const terrain = data[pos]
    const terrainSprite = data[pos + 1]
    const river = data[pos + 2] & 0x07
    const riverSprite = data[pos + 3]
    const road = data[pos + 4] & 0x07
    const roadSprite = data[pos + 5]
    const mirror = data[pos + 6]
    if (terrain === 8 && river !== 0) {
      throw new Error(`H3 water terrain with additional river overlay at tile ${i} (layer offset ${layerStart})`)
    }
    tiles.push({ terrain, terrainSprite, river, riverSprite, road, roadSprite, mirror })
  }
  return tiles
}
