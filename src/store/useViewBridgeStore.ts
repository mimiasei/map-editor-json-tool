// ─── View bridge store ───────────────────────────────────────────────────────
// Ephemeral navigation state connecting the Map Grid view and the Scenario
// Editor view (which are otherwise mutually exclusive full-pane views swapped
// by AppShell.tsx). Not persisted, no zundo history — this is "which view is
// showing / what's mid-flight", not scenario or map data.
//
// Two independent flows:
// - pendingSubjectSeed: Map Grid -> Scenario Editor. Set when the user clicks
//   "Create a rule for this" on a placed object; TriggerVisualBuilder reads it
//   to show a subject-filtered verb picker for the newly-created Trigger.
// - pendingPick / pendingResumeSelection: Scenario Editor -> Map Grid. Set
//   when the user clicks "pick from map" on a mapEntity/hero condition or
//   action field; resolved when they click the target on the grid (or
//   cancelled), which also restores TriggerVisualBuilder's open inspector row
//   (local component state that doesn't survive the view swap's unmount).

import { create } from 'zustand'
import type { SubjectKey } from '@/lib/trigger-subjects'
import type { SelectedNode } from '@/components/triggers/TriggerInspectorPanel'

export interface PendingPick {
  kind: 'mapEntity' | 'hero'
  /** Shown in the Map Grid picking banner, e.g. "Object entity". */
  label: string
  /** Writes the picked SID back into the right condition/action param. */
  onResolve: (value: string) => void
  /** Which inspector row to reopen once we're back in the Scenario Editor. */
  resumeSelection: SelectedNode
}

export interface PendingSubjectSeed {
  entitySid: string
  displayName?: string
  subjectKey: SubjectKey
  /** [questIndex, subQuestIndex, triggerIndex] of the Trigger this seed is for. */
  path: [number, number, number]
  /** Castle subjects only: the resolved faction display name (e.g. "Temple"),
   *  or "Random" when the city spawner has no faction assigned yet — shown
   *  next to the entity SID in the subject-first banner so the map maker
   *  knows which faction's buildings/verbs they're working with. */
  factionLabel?: string
}

interface ViewBridgeStore {
  mapGridOpen: boolean
  openMapGrid: () => void
  closeMapGrid: () => void

  pendingPick: PendingPick | null
  requestPick: (pick: PendingPick) => void
  resolvePick: (value: string) => void
  cancelPick: () => void

  pendingSubjectSeed: PendingSubjectSeed | null
  requestSubjectFirst: (seed: PendingSubjectSeed) => void
  clearSubjectSeed: () => void

  /** One-shot: consumed by TriggerVisualBuilder on mount, then cleared. */
  pendingResumeSelection: SelectedNode | null
  clearPendingResumeSelection: () => void
}

export const useViewBridgeStore = create<ViewBridgeStore>((set, get) => ({
  mapGridOpen: false,
  openMapGrid: () => set({ mapGridOpen: true }),
  closeMapGrid: () => set({ mapGridOpen: false }),

  pendingPick: null,
  requestPick: (pick) => set({ pendingPick: pick, mapGridOpen: true }),
  resolvePick: (value) => {
    const pick = get().pendingPick
    if (!pick) return
    pick.onResolve(value)
    set({ pendingPick: null, mapGridOpen: false, pendingResumeSelection: pick.resumeSelection })
  },
  cancelPick: () => {
    const pick = get().pendingPick
    if (!pick) return
    set({ pendingPick: null, mapGridOpen: false, pendingResumeSelection: pick.resumeSelection })
  },

  pendingSubjectSeed: null,
  requestSubjectFirst: (seed) => set({ pendingSubjectSeed: seed, mapGridOpen: false }),
  clearSubjectSeed: () => set({ pendingSubjectSeed: null }),

  pendingResumeSelection: null,
  clearPendingResumeSelection: () => set({ pendingResumeSelection: null }),
}))
