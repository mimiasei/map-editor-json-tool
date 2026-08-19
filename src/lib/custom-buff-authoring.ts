// ─── Custom buff authoring helpers (issue #165) ────────────────────────────────
import type { GameCatalog } from '@/lib/catalog/types'
import type { CustomBuffDefinition } from '@/types/custom-buff'

/** Whether `id` already belongs to a real buff anywhere in the game
 *  (catalog.buffs already covers all 19 DB/buffs/*.json files) or to a
 *  custom buff already authored on this map. Empty/whitespace-only ids are
 *  reported as not taken — the "required" check is a separate concern. */
export function isBuffIdTaken(
  id: string,
  catalog: GameCatalog | null,
  customBuffs: Record<string, CustomBuffDefinition>,
): boolean {
  const trimmed = id.trim()
  if (!trimmed) return false
  if (trimmed in customBuffs) return true
  return (catalog?.buffs ?? []).some((b) => b.id === trimmed)
}
