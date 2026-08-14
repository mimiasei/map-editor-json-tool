// ─── Custom artifact authoring helpers (issue #150) ───────────────────────────
import type { GameCatalog } from '@/lib/catalog/types'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'

/** Whether `id` already belongs to a real artifact anywhere in the game
 *  (catalog.artifacts already covers all 13 DB/items/items/*.json files) or
 *  to a custom artifact already authored on this map. Empty/whitespace-only
 *  ids are reported as not taken — the "required" check is a separate
 *  concern. */
export function isArtifactIdTaken(
  id: string,
  catalog: GameCatalog | null,
  customArtifacts: Record<string, CustomArtifactDefinition>,
): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  if (trimmed in customArtifacts) return true
  return (catalog?.artifacts ?? []).some((a) => a.id === trimmed)
}
