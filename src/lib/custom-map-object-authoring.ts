// ─── Custom map object authoring helpers (issue #146) ────────────────────────
import type { GameCatalog } from '@/lib/catalog/types'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'

/** Whether `id` already belongs to a real map object anywhere in the game
 *  (catalog.mapObjects already covers all 9 DB/map/objects/*.json category
 *  files) or to a custom map object already authored on this map. Empty/
 *  whitespace-only ids are reported as not taken — the "required" check is a
 *  separate concern. */
export function isMapObjectIdTaken(
  id: string,
  catalog: GameCatalog | null,
  customMapObjects: Record<string, CustomMapObjectDefinition>,
): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  if (trimmed in customMapObjects) return true
  return (catalog?.mapObjects ?? []).some((o) => o.id === trimmed)
}
