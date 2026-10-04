// ─── Game installation folder ────────────────────────────────────────────────
// The Olden Era install folder as found by the desktop app (src-tauri/src/
// game_dir.rs): the folder chosen in the Windows installer, else the Steam
// library that holds the game. Cached for the session; null on the web build
// or when the game isn't found.

import { isTauri } from '@/lib/native-fs'

let cached: Promise<string | null> | null = null

export function getGameDir(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null)
  cached ??= (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return (await invoke<string | null>('detect_game_dir')) ?? null
    } catch {
      return null
    }
  })()
  return cached
}

/** `<gameDir>/HeroesOldenEra_Data/StreamingAssets/<file>` with the folder's own separator. */
export function streamingAssetsPath(gameDir: string, file: string): string {
  const sep = gameDir.includes('\\') ? '\\' : '/'
  return [gameDir, 'HeroesOldenEra_Data', 'StreamingAssets', file].join(sep)
}
