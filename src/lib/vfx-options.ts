// ─── VFX display name helper ─────────────────────────────────────────────────
// Shared by EntityCombobox's 'vfx' entity category dropdown and
// trigger-visual.ts's CreateVFX sentence — kept here rather than duplicated
// since both need the exact same "no real display name exists" fallback.

import type { GameCatalog } from '@/lib/catalog/types'

/** VFX ids (DB/map/objects/5_fxs.json) have no in-game localized display
 *  name at all — confirmed no `${id}_name` (or any other) Core/Lang/english/
 *  texts entry exists for any of its 22 real entries, so CatalogMapObject.name
 *  just falls back to the raw id for this category. Synthesize a readable
 *  label from the sid itself instead of showing e.g. "fx_fireflies_yellow"
 *  verbatim — this is an editor-invented label, not real game text. */
export function humanizeFxId(id: string): string {
  return id
    .replace(/^fx_/, '')
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Display name for a CreateVFX "VFX SID" param value — the catalog's own
 *  fxs entry if one's loaded and matches, else a best-effort label straight
 *  from the sid (so a hand-typed sid, or one seen before a catalog is
 *  loaded, still shows something readable instead of the raw sid). */
export function getVfxDisplayName(catalog: GameCatalog | null | undefined, sid: string): string {
  const known = catalog?.mapObjects.find((o) => o.category === 'fxs' && o.id === sid)
  return humanizeFxId(known?.id ?? sid)
}
