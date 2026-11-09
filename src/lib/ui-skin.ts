// ─── Game skin sprites ────────────────────────────────────────────────────────
// The sidecar's `export-ui` mode extracts the game's own UI sprites into AppLocalData/ui-skin/ (never shipped with
// the app, same as the thumbnails). The manifest carries each sprite's size and its 9-slice border in image pixels,
// already in CSS `border-image-slice` order (top right bottom left).

import { isTauri } from '@/lib/native-fs'

export interface SkinSprite {
  w: number
  h: number
  /** top, right, bottom, left, in the PNG's own pixels. */
  border: [number, number, number, number]
}

interface SkinManifest {
  version: number
  /** Size + mtime of the game's resources.assets when the sprites were exported. */
  build: string
  sprites: Record<string, SkinSprite>
}

export interface SkinExtractResult {
  saved: number
  missing: string[]
}

export interface SkinProgress {
  done: number
  total: number
  current: string
}

let skinDir: string | null = null
let manifest: SkinManifest | null = null

async function resolveSkinDir(): Promise<string> {
  if (skinDir) return skinDir
  const { appLocalDataDir } = await import('@tauri-apps/api/path')
  // Forward slashes with a trailing separator, like the thumbnail directory.
  skinDir = `${(await appLocalDataDir()).replace(/\\/g, '/').replace(/\/?$/, '/')}ui-skin/`
  return skinDir
}

/** Reads the manifest of an earlier extraction. Resolves false on the web build or when nothing was extracted yet. */
export async function loadUiSkin(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    manifest = JSON.parse(await readTextFile(`${await resolveSkinDir()}manifest.json`)) as SkinManifest
    return true
  } catch {
    manifest = null
    return false
  }
}

export function isUiSkinAvailable(): boolean {
  return manifest !== null
}

/** The game build the sprites were exported from, to tell whether a re-extract is due. */
export function uiSkinBuild(): string | null {
  return manifest?.build ?? null
}

/** Extracts the sprites from the game folder, then loads the manifest. Throws the sidecar's message on failure. */
export async function extractUiSkin(
  gameDir: string,
  onProgress?: (p: SkinProgress) => void,
): Promise<SkinExtractResult> {
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ])
  const unlisten = await listen<SkinProgress>('ui-skin-progress', (e) => onProgress?.(e.payload))
  try {
    const result = await invoke<SkinExtractResult>('export_ui_skin', {
      gameDir,
      outputDir: (await resolveSkinDir()).replace(/\/$/, ''),
    })
    await loadUiSkin()
    return result
  } finally {
    unlisten()
  }
}

/**
 * CSS custom properties for every extracted sprite: `--skin-<key>` is the `url(...)`, `--skin-<key>-slice` the
 * `border-image-slice` value (unitless pixels). Keys use dashes (`dropdown_frame` -> `--skin-dropdown-frame`).
 * Null when no skin is available.
 */
export async function skinCssVars(): Promise<Record<string, string> | null> {
  if (!manifest) return null
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  const dir = await resolveSkinDir()
  const vars: Record<string, string> = {}
  for (const [key, s] of Object.entries(manifest.sprites)) {
    const name = `--skin-${key.replace(/_/g, '-')}`
    vars[name] = `url("${convertFileSrc(`${dir}${key}.png`)}")`
    vars[`${name}-slice`] = s.border.join(' ')
  }
  return vars
}
