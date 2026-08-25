// ─── "Create New Map" orchestration ───────────────────────────────────────────
// Ties together: read the bundled blank-map template resource → build a
// fresh container (buildBlankMap, map-write.ts) → prompt a save path → write
// → load through the exact same path Import Map uses (loadParsedMapFile,
// map-file.ts), so the rest of the app treats a freshly-created map no
// differently from one just opened. Tauri-only — needs real filesystem
// write access; there is no equivalent for the web build.

import { isTauri, pickSavePath, writeBinaryFile, readBinaryFile } from '@/lib/native-fs'
import { readMapContainer, buildMapContainer, gzipBytes, gunzipBytes, buildBlankMap, type BlankMapPlayer } from '@/lib/map-write'
import { loadParsedMapFile, type OpenMapResult } from '@/lib/map-file'

export interface CreateNewMapOptions {
  mapName: string
  sizeX: number
  sizeZ: number
  /** Biome id 1-7 (BIOME_NAMES in terrain-colors.ts). */
  biomeId: number
  players: BlankMapPlayer[]
}

/**
 * Prompt for a destination path, write a brand-new blank .map file there,
 * and load it into the app exactly like Import Map would. Returns null if
 * the user cancels the save dialog, or if not running in Tauri (no write
 * access at all in the web build).
 */
export async function createNewMap(options: CreateNewMapOptions): Promise<OpenMapResult | null> {
  if (!isTauri()) return null

  const { resourceDir, join } = await import('@tauri-apps/api/path')
  const templatePath = await join(await resourceDir(), 'template.map')
  const templateBuffer = await readBinaryFile(templatePath)
  if (!templateBuffer) throw new Error(`Could not read the blank-map template at "${templatePath}"`)

  const templateContainer = readMapContainer(await gunzipBytes(new Uint8Array(templateBuffer)))

  const fileName = options.mapName.endsWith('.map') ? options.mapName : `${options.mapName}.map`
  const destPath = await pickSavePath(fileName, { name: 'Map file', extensions: ['map'] }, 'Create new map')
  if (!destPath) return null

  const container = buildBlankMap(templateContainer, {
    sizeX: options.sizeX,
    sizeZ: options.sizeZ,
    biomeId: options.biomeId,
    players: options.players,
  })
  const gzipped = await gzipBytes(buildMapContainer(container))

  await writeBinaryFile(destPath, gzipped)

  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer
  const name = destPath.replace(/\\/g, '/').split('/').pop() ?? destPath
  return loadParsedMapFile(name, destPath, buffer)
}
