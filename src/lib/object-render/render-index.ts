// ─── Rendered object images: where they live and how to find one ─────────────
// <appLocalData>/renders/<sid>.png plus renders/index.json (see RenderIndex). Made on the user's machine from their own
// game install by render-job.ts; never part of the repo or the build. Desktop build only: on the web build nothing is
// ever loaded and every lookup answers "no render", so the grid keeps the extracted 64 px icons.

import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/native-fs'
import { useObjectRenderStore, type RenderEntry, type RenderIndex } from '@/store/useObjectRenderStore'

export { RENDER_PPU as RENDER_PX_PER_TILE } from './canvas-size'

let baseDir: string | null = null

/** `<appLocalData>/` with forward slashes and a trailing slash. */
export async function appDataDir(): Promise<string> {
  if (baseDir) return baseDir
  const { appLocalDataDir } = await import('@tauri-apps/api/path')
  baseDir = (await appLocalDataDir()).replace(/\\/g, '/').replace(/\/?$/, '/')
  return baseDir
}

export const emptyIndex = (): RenderIndex => ({ version: 1, objects: {}, aliases: {}, skipped: [] })

/** Read renders/index.json into the store. A missing or unreadable file is an empty index (nothing rendered yet). */
export async function loadRenderIndex(): Promise<void> {
  if (!isTauri()) return
  const dir = await appDataDir()
  let index = emptyIndex()
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const parsed = JSON.parse(await readTextFile(`${dir}renders/index.json`)) as RenderIndex
    if (parsed.version === 1) index = { ...index, ...parsed }
  } catch {
    // Not created yet.
  }
  useObjectRenderStore.getState().setIndex(index)
}

export async function saveRenderIndex(index: RenderIndex): Promise<void> {
  const dir = await appDataDir()
  const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs')
  await mkdir(`${dir}renders`, { recursive: true })
  await writeTextFile(`${dir}renders/index.json`, JSON.stringify(index))
  useObjectRenderStore.getState().setIndex(index)
}

export interface ObjectRender extends RenderEntry {
  src: string
}

/**
 * The render for a map object sid, or null when there is none (web build, not rendered yet, or no mesh in the game).
 * Synchronous and safe during render; components that call it subscribe to the store's `index` so they redraw when a
 * render job adds images.
 */
export function objectRender(sid: string | undefined): ObjectRender | null {
  if (!sid || !baseDir) return null
  const index = useObjectRenderStore.getState().index
  if (!index) return null
  const id = index.aliases[sid] ?? sid
  const entry = index.objects[id]
  if (!entry) return null
  return { ...entry, src: convertFileSrc(`${baseDir}renders/${id}.png`) }
}

export function hasObjectRender(sid: string | undefined): boolean {
  if (!sid) return false
  const index = useObjectRenderStore.getState().index
  return !!index && (index.aliases[sid] ?? sid) in index.objects
}
