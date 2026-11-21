// ─── "Publish needed" ─────────────────────────────────────────────────────────
// Quests are written into the .map by Save, but dialogs, text and custom content only reach the game through the map ZIP that
// Publish writes next to Core.zip. Forgetting that step gives a map whose dialogs never show (and whose quests seem dead), so the
// Publish button and a notice after Save say so. Needed when something shipped in the ZIP changed since the last Publish
// (zipDirty), or when the project has ZIP content and was not published since it was opened (a freshly opened map's ZIP may
// never have been written; the game folder is not checked).

import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { isTauri } from '@/lib/native-fs'

type State = ReturnType<typeof useScenarioStore.getState>

export function selectPublishNeeded(s: State): boolean {
  const hasZipContent =
    Object.keys(s.dialogs).length > 0 || Object.keys(s.localization).length > 0 ||
    Object.keys(s.customHeroes).length > 0 || Object.keys(s.customMapObjects).length > 0 ||
    Object.keys(s.customArtifacts).length > 0 || Object.keys(s.customBuffs).length > 0
  return s.zipDirty || (hasZipContent && s.zipPublishedFor !== (s.mapFilePath ?? ''))
}

/** After a finished Save / Save As: show the Publish notice if the game still lacks the ZIP (desktop only). */
export function nudgeToPublishIfNeeded(): void {
  if (isTauri() && selectPublishNeeded(useScenarioStore.getState())) useViewBridgeStore.getState().setPublishNudge(true)
}

export function usePublishNeeded(): boolean {
  return useScenarioStore(selectPublishNeeded)
}
