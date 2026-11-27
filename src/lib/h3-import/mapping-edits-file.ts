// The H3 mapping edits as a JSON file in the app's data folder (next to rmg-tuning.json), outside the app bundle: it survives updates and can be
// edited or shared by hand. Desktop only. The store also keeps the edits in localStorage as a working copy; this file is what "Save" writes.

import { logInfo, logWarn } from '@/lib/logger'
import { isTauri } from '@/lib/native-fs'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import type { MappingEdits } from './h3-object-mapping'

export const MAPPING_EDITS_FILE = 'h3-mapping-edits.json'

async function filePath(): Promise<string> {
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  return join(await appDataDir(), MAPPING_EDITS_FILE)
}

/** Writes the edits to the data folder and returns the path. */
export async function saveMappingEditsFile(edits: MappingEdits): Promise<string> {
  const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
  const { appDataDir } = await import('@tauri-apps/api/path')
  await mkdir(await appDataDir(), { recursive: true })
  const path = await filePath()
  await writeTextFile(path, JSON.stringify({ version: 1, ...edits }, null, 2) + '\n')
  logInfo(`H3 mapping edits saved: ${path}`)
  return path
}

/** Reads the saved file into the store. Returns how many pieces were taken, or null when there is no readable file. Never throws. */
export async function loadMappingEditsFile(): Promise<number | null> {
  if (!isTauri()) return null
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await filePath()
    if (!(await exists(path))) return null
    let text = await readTextFile(path)
    if (text.startsWith('﻿')) text = text.slice(1)
    const raw = JSON.parse(text) as Partial<MappingEdits>
    const taken = useH3MappingStore.getState().importEdits(Object.values(raw.rows ?? {}), raw.spriteRules, raw.settings, { sceneryRoleSids: raw.sceneryRoleSids, decorationRules: raw.decorationRules })
    logInfo(`H3 mapping edits loaded from ${path}`)
    return taken
  } catch (error) {
    logWarn(`H3 mapping edits file ignored: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** At startup: when the working copy is empty (a fresh browser profile, cleared storage), take the saved file so imports use it. */
export async function loadMappingEditsIfEmpty(): Promise<void> {
  const edits = useH3MappingStore.getState().edits
  const empty = Object.keys(edits.rows).length === 0 && !edits.spriteRules && Object.keys(edits.settings).length === 0 && Object.keys(edits.sceneryRoleSids).length === 0 && !edits.decorationRules
  if (empty) await loadMappingEditsFile()
}
