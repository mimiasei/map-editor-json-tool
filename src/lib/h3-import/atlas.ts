// ─── Side-by-side layer atlas ────────────────────────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_scenario_translation.py`, used with the author's explicit permission.
//
// H3's surface + underground layers get laid out SIDE BY SIDE in one shared
// OE grid (not stacked as separate "levels" the way H3 does with a z-plane
// bit) — H3's Y axis (top-down) flips before packing into OE's flat
// `node = z*sizeX + x` addressing.
//
// Deliberately NOT ported this round: `apply_stock_underground_tunnel_clearance`
// (a Chebyshev-2 rock→walkable-Dirt widening pass for underground tunnel
// shoulders, upstream's stand-in for H3's Burrow-adjacent clearance) — a
// real refinement, not a correctness requirement; omitting it can leave some
// underground tunnel edges narrower than upstream's output, never wrong.
// Tracked as a known gap rather than silently dropped.

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

  const layerWidth = alignToSector(sourceWidth, sectorSize)
  const layerHeight = alignToSector(sourceHeight, sectorSize)
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
