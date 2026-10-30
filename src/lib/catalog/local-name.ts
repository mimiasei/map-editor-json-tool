// ─── Localized game names (display only) ──────────────────────────────────────
// `catalog.<kind>[].name` is English and is what gets written into the map (speaker tokens, prefilled
// editors, generated story text). Anything that only *shows* a name goes through here, so it follows
// the UI language and falls back to the English name when Core.zip has no text for it.

import type { GameCatalog, LocalNameKind } from './types'

/** `catalog` is typed loosely because some screens hold a catalog-shaped fallback (the built-in lists) with no `localNames`. */
type CatalogLike = object | null | undefined

export function localNameById(catalog: CatalogLike, kind: LocalNameKind, id: string, englishName: string): string {
  return (catalog as Pick<GameCatalog, 'localNames'> | null | undefined)?.localNames?.[kind]?.[id] ?? englishName
}

export function localName(catalog: CatalogLike, kind: LocalNameKind, entity: { id: string; name: string }): string {
  return localNameById(catalog, kind, entity.id, entity.name)
}
