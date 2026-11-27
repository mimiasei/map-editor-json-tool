// ─── Game installation folders ───────────────────────────────────────────────
// The Olden Era install folder as found by the desktop app (src-tauri/src/
// game_dir.rs): the folder chosen in the Windows installer, else the Steam
// library that holds the game. Also the game's per-user `my_maps` folder and the
// Heroes 3 folder (h3_dir.rs). Results are kept in useInstallPathsStore so file
// dialogs can open there; all of it is null on the web build or when not found.

import { isTauri } from '@/lib/native-fs'
import { useInstallPathsStore } from '@/store/useInstallPathsStore'

type PathKey = 'oeGameDir' | 'oeMyMapsDir' | 'h3Dir'

const detecting = new Map<string, Promise<string | null>>()

function detect(command: string, key: PathKey): Promise<string | null> {
  let p = detecting.get(command)
  if (!p) {
    p = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const found = (await invoke<string | null>(command)) ?? null
        if (found) useInstallPathsStore.getState().setPath(key, found)
        return found
      } catch {
        return null
      }
    })()
    detecting.set(command, p)
  }
  return p
}

/** A folder the user picked or an earlier run found wins over detecting again. */
export async function getGameDir(): Promise<string | null> {
  if (!isTauri()) return null
  return useInstallPathsStore.getState().oeGameDir ?? detect('detect_game_dir', 'oeGameDir')
}

/** Detected every session (last_user.txt can change), the saved value is the fallback. */
export async function getMyMapsDir(): Promise<string | null> {
  if (!isTauri()) return null
  return (await detect('detect_my_maps_dir', 'oeMyMapsDir')) ?? useInstallPathsStore.getState().oeMyMapsDir
}

export async function getH3Dir(): Promise<string | null> {
  if (!isTauri()) return null
  return useInstallPathsStore.getState().h3Dir ?? detect('detect_h3_dir', 'h3Dir')
}

function join(dir: string, ...parts: string[]): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return [dir, ...parts].join(sep)
}

/** `<gameDir>/HeroesOldenEra_Data/StreamingAssets/<file>` with the folder's own separator. */
export function streamingAssetsPath(gameDir: string, file: string): string {
  return join(gameDir, 'HeroesOldenEra_Data', 'StreamingAssets', file)
}

/** `<h3Dir>/Maps` with the folder's own separator. */
export function h3MapsPath(h3Dir: string): string {
  return join(h3Dir, 'Maps')
}

/** `<myMapsDir>/<file>` with the folder's own separator. */
export function myMapsPath(myMapsDir: string, file: string): string {
  return join(myMapsDir, file)
}
