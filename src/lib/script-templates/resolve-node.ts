import type { MapContext } from '@/types/map-context'

/**
 * Resolve a placed object's raw node index (z * sizeX + x) from its
 * propEntities SID. Reuses PlacedObject.node (already precomputed during map
 * parsing, src/lib/map-extract.ts) instead of re-deriving x/z/sizeX math.
 */
export function resolveNodeForSid(sid: string, mapContext: MapContext): number | undefined {
  return mapContext.placedObjects.find((p) => p.entitySid === sid)?.node
}
