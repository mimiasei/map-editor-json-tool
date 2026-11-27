import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Install folders found once by the desktop app (src-tauri game_dir.rs / h3_dir.rs) or picked by the
// user, kept so file dialogs can open there. A value the user typed or picked wins over detection.
interface InstallPathsState {
  oeGameDir: string | null
  oeMyMapsDir: string | null
  h3Dir: string | null
  /** Folder of the last imported .h3m, so the next import opens there. */
  h3LastImportDir: string | null
  setPath: (key: 'oeGameDir' | 'oeMyMapsDir' | 'h3Dir' | 'h3LastImportDir', value: string | null) => void
}

export const useInstallPathsStore = create<InstallPathsState>()(
  persist(
    (set) => ({
      oeGameDir: null,
      oeMyMapsDir: null,
      h3Dir: null,
      h3LastImportDir: null,
      setPath: (key, value) => set({ [key]: value?.trim() || null }),
    }),
    { name: 'tse-install-paths', version: 1 },
  ),
)
