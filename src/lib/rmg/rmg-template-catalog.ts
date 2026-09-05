// ─── Bundled game RMG template catalog (issue #210, Stage 1 template picker) ─
// Lists/reads the real game templates bundled as Tauri resources
// (`src-tauri/resources/templates/*.rmg.json`, copied verbatim from this
// repo's own `maps/templates/` — the same ~60 real files Stage 1's
// rmg-template-import.ts was verified against). Tauri-only, same reasoning
// as every other resource-reading module in this codebase.

import { isTauri, readTextFileAt } from '@/lib/native-fs'
import type { GameCatalog } from '@/lib/catalog/types'

export interface BundledGameTemplateInfo {
  fileName: string
  name: string
  /** Resolved via `catalog.rmgTemplateStrings` — the template's own
   *  `description` field is a localization sid, not literal text (see
   *  `CATALOG_SCHEMA_VERSION`'s v11 doc comment). Empty string if the sid
   *  can't be resolved. */
  description: string
  sizeX: number
  sizeZ: number
  gameMode: string
  /** Counted from the template's own first variant's Spawn main objects —
   *  same detection `rmg-template-import.ts`'s `buildTopologyFromVariant`
   *  uses, done here as a cheap read-only preview (not a real import). */
  playerCount: number
}

async function templatesResourceDir(): Promise<string> {
  const { resourceDir, join } = await import('@tauri-apps/api/path')
  return join(await resourceDir(), 'resources', 'templates')
}

/** Lists every bundled game template with enough info for a picker UI.
 *  Returns `null` outside Tauri (no filesystem access), same convention as
 *  every other Tauri-only RMG entry point. Malformed/unreadable files are
 *  silently skipped rather than failing the whole list — one broken
 *  bundled file shouldn't hide the other ~60 real ones. */
export async function listBundledGameTemplates(catalog: GameCatalog): Promise<BundledGameTemplateInfo[] | null> {
  if (!isTauri()) return null
  const { join } = await import('@tauri-apps/api/path')
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const dir = await templatesResourceDir()
  const entries = await readDir(dir)

  const infos: BundledGameTemplateInfo[] = []
  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith('.rmg.json')) continue
    try {
      const text = await readTextFileAt(await join(dir, entry.name))
      if (!text) continue
      const data = JSON.parse(text) as {
        name?: string
        description?: string
        sizeX?: number
        sizeZ?: number
        gameMode?: string
        variants?: { zones?: { mainObjects?: { type?: string }[] }[] }[]
      }
      const descriptionSid = typeof data.description === 'string' ? data.description.toLowerCase() : ''
      const firstVariant = data.variants?.[0]
      const playerCount = (firstVariant?.zones ?? []).filter((z) => z.mainObjects?.some((mo) => mo.type === 'Spawn')).length
      infos.push({
        fileName: entry.name,
        name: typeof data.name === 'string' && data.name ? data.name : entry.name.replace(/\.rmg\.json$/, ''),
        description: catalog.rmgTemplateStrings[descriptionSid] ?? '',
        sizeX: data.sizeX ?? 0,
        sizeZ: data.sizeZ ?? 0,
        gameMode: typeof data.gameMode === 'string' ? data.gameMode : '',
        playerCount,
      })
    } catch {
      continue
    }
  }
  infos.sort((a, b) => a.name.localeCompare(b.name))
  return infos
}

/** Reads one bundled template's raw JSON text (for `GenerateRandomMapOptions.
 *  gameTemplateJson`/`GenerateTerrainOptions.gameTemplateJson`). Returns
 *  `null` outside Tauri. */
export async function readBundledGameTemplateJson(fileName: string): Promise<string | null> {
  if (!isTauri()) return null
  const { join } = await import('@tauri-apps/api/path')
  return readTextFileAt(await join(await templatesResourceDir(), fileName))
}
