// ─── Session hand-off across an app restart ───────────────────────────────────
// Installing an update terminates the app: on Windows the updater force-exits
// mid-install, on macOS the bundle is replaced and relaunched. Anything the user
// had open would be gone.
//
// So before installing we snapshot the whole project to a file in AppLocalData
// and restore it on the next launch. The file is deleted only AFTER a successful
// restore, so a crash partway through doesn't take the work with it.
//
// AppLocalData is already granted in src-tauri/capabilities/default.json
// (fs:allow-applocaldata-read-recursive / -write-recursive), same place the
// extracted thumbnails live.

import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { TranslationMap } from '@/lib/languages'
import { useScenarioStore } from '@/store/useScenarioStore'
import { isTauri } from '@/lib/native-fs'
import { logInfo, logWarn } from '@/lib/logger'

const HANDOFF_FILE = 'pending-session.json'

/** Bump when the envelope shape changes — older files are then ignored, not misread. */
const HANDOFF_VERSION = 1

export interface SessionHandoff {
  v: number
  /** App version that wrote the file, for diagnostics. */
  writtenBy: string
  writtenAt: string
  reason: 'update'
  file: {
    currentFilePath: string | null
    currentFileName: string | null
    mapFilePath: string | null
    sidecarPath: string | null
  }
  project: {
    scenario: ScenarioFile
    mapName: string
    dialogs: Record<string, DialogFlow>
    localization: Record<string, string>
    translations: TranslationMap
    customHeroes: Record<string, CustomHeroDefinition>
    customMapObjects: Record<string, CustomMapObjectDefinition>
  }
  /** Whether the snapshot had unsaved changes, so the restore can say so. */
  wasDirty: boolean
}

// ─── Path helper ──────────────────────────────────────────────────────────────

async function handoffPath(): Promise<string> {
  const { appLocalDataDir } = await import('@tauri-apps/api/path')
  const dir = (await appLocalDataDir()).replace(/\\/g, '/').replace(/\/?$/, '/')
  return `${dir}${HANDOFF_FILE}`
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Snapshot the current project so the next launch can restore it.
 * Throws on failure — the caller must not proceed with an install it can't undo.
 */
export async function writeSessionHandoff(
  reason: SessionHandoff['reason'] = 'update',
): Promise<void> {
  if (!isTauri()) return

  const s = useScenarioStore.getState()
  const { getVersion } = await import('@tauri-apps/api/app')

  const payload: SessionHandoff = {
    v: HANDOFF_VERSION,
    writtenBy: await getVersion(),
    writtenAt: new Date().toISOString(),
    reason,
    file: {
      currentFilePath: s.currentFilePath,
      currentFileName: s.currentFileName,
      mapFilePath: s.mapFilePath,
      sidecarPath: s.sidecarPath,
    },
    project: {
      scenario: s.scenario,
      mapName: s.mapName,
      dialogs: s.dialogs,
      localization: s.localization,
      translations: s.translations,
      customHeroes: s.customHeroes,
      customMapObjects: s.customMapObjects,
    },
    wasDirty: s.isDirty,
  }

  const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs')
  const { appLocalDataDir } = await import('@tauri-apps/api/path')

  // First run may not have the directory yet
  try {
    await mkdir(await appLocalDataDir(), { recursive: true })
  } catch {
    // already exists
  }

  await writeTextFile(await handoffPath(), JSON.stringify(payload))
  logInfo(`Wrote session hand-off (${reason})`)
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Read a pending hand-off, or null when there is none. Never throws: a corrupt or
 * truncated file must not stop the app from starting, it just means we lost the
 * snapshot.
 */
export async function readSessionHandoff(): Promise<SessionHandoff | null> {
  if (!isTauri()) return null

  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await handoffPath()
    if (!(await exists(path))) return null

    const parsed = JSON.parse(await readTextFile(path)) as unknown
    if (!parsed || typeof parsed !== 'object') {
      logWarn('Session hand-off is not an object — ignoring.')
      return null
    }

    const h = parsed as Partial<SessionHandoff>
    if (h.v !== HANDOFF_VERSION) {
      logWarn(`Session hand-off version ${String(h.v)} not understood — ignoring.`)
      return null
    }
    if (!h.project?.scenario || !Array.isArray(h.project.scenario.quests)) {
      logWarn('Session hand-off has no usable scenario — ignoring.')
      return null
    }

    return h as SessionHandoff
  } catch (e) {
    logWarn(`Could not read session hand-off: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

/** Delete the hand-off file. Call only after a successful restore. */
export async function clearSessionHandoff(): Promise<void> {
  if (!isTauri()) return
  try {
    const { exists, remove } = await import('@tauri-apps/plugin-fs')
    const path = await handoffPath()
    if (await exists(path)) await remove(path)
  } catch (e) {
    // A leftover file is harmless — the next restore overwrites it, and a stale
    // one only costs one spurious restore prompt.
    logWarn(`Could not delete session hand-off: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export interface RestoreResult {
  restored: boolean
  wasDirty: boolean
  fileName: string | null
  writtenBy: string | null
}

/**
 * Restore a pending hand-off into the store and delete the file.
 * Returns what happened so the UI can tell the user their work came back.
 */
export async function restoreSessionHandoff(): Promise<RestoreResult> {
  const none: RestoreResult = {
    restored: false,
    wasDirty: false,
    fileName: null,
    writtenBy: null,
  }

  const handoff = await readSessionHandoff()
  if (!handoff) return none

  useScenarioStore.getState().hydrateProject({
    ...handoff.project,
    ...handoff.file,
    isDirty: handoff.wasDirty,
  })

  // Only now is it safe to drop the file
  await clearSessionHandoff()
  logInfo(`Restored session from ${handoff.writtenBy} (${handoff.reason})`)

  return {
    restored: true,
    wasDirty: handoff.wasDirty,
    fileName: handoff.file.currentFileName,
    writtenBy: handoff.writtenBy,
  }
}
