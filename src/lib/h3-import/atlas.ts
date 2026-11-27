// ─── Side-by-side layer atlas ────────────────────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_scenario_translation.py`, used with the author's explicit permission.
//
// H3's surface + underground layers get laid out SIDE BY SIDE in one shared
// OE grid (not stacked as separate "levels" the way H3 does with a z-plane
// bit) — H3's Y axis (top-down) flips before packing into OE's flat
// `node = z*sizeX + x` addressing.
//
// Not ported: `apply_stock_underground_tunnel_clearance` (rock -> walkable Dirt around tunnels). terrain-map.ts `applyRockSkirt` replaces it
// without widening: rock beside floor drops to level 0, so tunnels keep their H3 width.

export const OLDEN_VIEW_SECTION_SIZE = 16

export interface AtlasLayerSpec {
  offsetX: number
  offsetY: number
}

export interface LayerAtlasLayout {
  sourceWidth: number
  sourceHeight: number
  layerWidth: number
  layerHeight: number
  atlasWidth: number
  atlasHeight: number
  sourceOffsetX: number
  sourceOffsetY: number
  sectorSize: number
  layers: Record<number, AtlasLayerSpec>
  targetNode(layer: number, sourceX: number, sourceY: number): number
}

export function alignToSector(size: number, sectorSize = OLDEN_VIEW_SECTION_SIZE): number {
  if (size <= 0) throw new Error(`Size must be a positive integer: ${size}`)
  return Math.ceil(size / sectorSize) * sectorSize
}

/** Build the atlas layout for a set of H3 source layers (surface=0, each
 *  underground layer 1, 2, ...). Each layer is padded up to a 16-tile
 *  sector boundary and centered within it, then placed at increasing
 *  x-offsets in the shared atlas. */
export function buildSideBySideLayerAtlas(sourceWidth: number, sourceHeight: number, layerIds: number[], sectorSize = OLDEN_VIEW_SECTION_SIZE): LayerAtlasLayout {
  if (layerIds.length === 0) throw new Error('At least one source layer is required')
  if (new Set(layerIds).size !== layerIds.length) throw new Error(`Source layer list contains duplicates: ${layerIds}`)

  // Two tiles of margin on every side: the first is the level-0 ring beside floor (terrain-map.ts paintEnvelopePadding), the second the
  // level-1 wall behind it, which also keeps neighbouring layers apart on a map whose size is already a multiple of 16.
  const layerWidth = alignToSector(sourceWidth + 4, sectorSize)
  const layerHeight = alignToSector(sourceHeight + 4, sectorSize)
  const sourceOffsetX = Math.floor((layerWidth - sourceWidth) / 2)
  const sourceOffsetY = Math.floor((layerHeight - sourceHeight) / 2)
  if (sourceOffsetX < 0 || sourceOffsetY < 0) throw new Error('Aligned layer envelope is smaller than the source map')

  const layers: Record<number, AtlasLayerSpec> = {}
  layerIds.forEach((layer, atlasIndex) => {
    const layerOriginX = atlasIndex * layerWidth
    layers[layer] = { offsetX: layerOriginX + sourceOffsetX, offsetY: sourceOffsetY }
  })

  const atlasWidth = layerWidth * layerIds.length
  const atlasHeight = layerHeight

  return {
    sourceWidth, sourceHeight, layerWidth, layerHeight, atlasWidth, atlasHeight,
    sourceOffsetX, sourceOffsetY, sectorSize, layers,
    targetNode(layer: number, sourceX: number, sourceY: number): number {
      const spec = layers[layer]
      if (!spec) throw new Error(`Unsupported source layer: ${layer}`)
      if (!(sourceX >= 0 && sourceX < sourceWidth && sourceY >= 0 && sourceY < sourceHeight)) {
        throw new Error(`Source coordinate outside emitted envelope: layer=${layer} ${sourceX},${sourceY}`)
      }
      return (sourceHeight - 1 - sourceY + spec.offsetY) * atlasWidth + sourceX + spec.offsetX
    },
  }
}
