import type { CatalogMapObject, GameCatalog } from './types'

const byIdCache = new WeakMap<GameCatalog, Map<string, CatalogMapObject>>()

/** Catalog template by sid. Map Grid code looks one up per placed object (tens of thousands), so a linear `find` was the bulk of an edit's redraw. */
export function findMapObject(catalog: GameCatalog | null | undefined, sid: string): CatalogMapObject | undefined {
  if (!catalog) return undefined
  let byId = byIdCache.get(catalog)
  if (!byId) {
    byId = new Map()
    for (const o of catalog.mapObjects) if (!byId.has(o.id)) byId.set(o.id, o)
    byIdCache.set(catalog, byId)
  }
  return byId.get(sid)
}
