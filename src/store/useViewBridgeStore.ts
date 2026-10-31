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
//   action field, or clicks a node number directly on a Card view sentence
//   (SentenceView); resolved when they click the target on the grid (or
//   cancelled), which also restores TriggerVisualBuilder's open inspector row
//   (local component state that doesn't survive the view swap's unmount).

import { create } from 'zustand'
import type { SubjectKey } from '@/lib/trigger-subjects'
import { useMapContextStore } from '@/store/useMapContextStore'
import type { SelectedNode } from '@/components/triggers/TriggerInspectorPanel'

export interface PendingPick {
  kind: 'mapEntity' | 'hero' | 'node'
  /** Shown in the Map Grid picking banner, e.g. "Object entity". */
  label: string
  /** Writes the picked SID back into the right condition/action param. */
  onResolve: (value: string) => void
  /** Which inspector row to reopen once we're back in the Scenario Editor. */
  resumeSelection?: SelectedNode
  /** Runs after the pick is resolved OR cancelled (e.g. to reopen a dialog that
   *  was closed while the user picked on the grid). */
  onFinish?: () => void
  /** 'node' picks only: the param's value before picking, as a string (e.g.
   *  "1458") — clicking that exact same tile again is a no-op rather than
   *  popping the change-confirmation dialog (nothing would actually change). */
  currentValue?: string
  /** 'node' picks only: pop a Change/Cancel confirm dialog before applying a
   *  different tile, instead of resolving immediately like every other kind.
   *  Set when a node is picked straight off a Card view sentence (a passive-
   *  looking click that could easily be a misclick) — not set for the form's
   *  own "pick from map" button (ConditionForm/ActionForm), which behaves
   *  exactly like the mapEntity/hero pick buttons: one click, done. */
  confirmOnChange?: boolean
  /** Picked from inside the Map Grid itself (its info column): the grid is already open, so resolving or
   *  cancelling must not close it or send the user back to the Scenario Editor. */
  keepMapGridOpen?: boolean
}

export interface PendingDatabaseFocus {
  /** GameDatabaseDialog's TabId, kept as a plain string here so this store
   *  doesn't need to import a components/ file just for a type. */
  tab: string
  id: string
  /** Monotonic so re-clicking the same sid while the dialog is already open
   *  still re-fires the focus effect (object identity alone wouldn't). */
  requestId: number
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
  /** The "quests belong to a map" notice shown when the Quests tab is chosen with no map loaded. */
  noMapNoticeOpen: boolean
  /** Switches to the Quests view; with no map loaded it asks first (unless the user switched the notice off). */
  goToQuests: () => void
  confirmGoToQuests: () => void
  dismissNoMapNotice: () => void
  openMapGrid: () => void
  closeMapGrid: () => void
  /** The Map tab shows the start screen even though a map is loaded (what closing the Map Grid leads to). */
  startScreenOpen: boolean
  showStartScreen: () => void

  /** Generate Random Map — a full-pane view swapped in the same way as Map
   *  Grid (issue #232), not a floating dialog. */
  rmgOpen: boolean
  openRmg: () => void
  closeRmg: () => void

  /** One-shot: Generate Random Map's own warnings, reported once generation
   *  finishes, consumed by Toolbar's existing import-feedback dialog (the
   *  same "Import Issues" surface New Map/Import H3/Open already use) —
   *  needed because the RMG pane now renders from AppShell, not Toolbar,
   *  same "pending X" one-shot shape as pendingDatabaseFocus above. */
  pendingGeneratedWarnings: string[] | null
  reportGeneratedWarnings: (warnings: string[]) => void
  clearGeneratedWarnings: () => void

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

  /** Opens the Game Database dialog focused on one item — used when a map
   *  maker clicks a hero/object sid in a condition/action card (Card view). */
  pendingDatabaseFocus: PendingDatabaseFocus | null
  openDatabaseItem: (tab: string, id: string) => void
  clearDatabaseFocus: () => void
}

let nextDatabaseFocusId = 0

export const NO_MAP_NOTICE_KEY = 'oe:no-map-notice-off'
function noMapNoticeDisabled(): boolean {
  try { return localStorage.getItem(NO_MAP_NOTICE_KEY) === '1' } catch { return false }
}

export const useViewBridgeStore = create<ViewBridgeStore>((set, get) => ({
  // TSE starts on the Map tab; with no map that is the start screen.
  mapGridOpen: true,
  noMapNoticeOpen: false,
  goToQuests: () => {
    if (useMapContextStore.getState().context === null && !noMapNoticeDisabled()) {
      set({ noMapNoticeOpen: true })
      return
    }
    set({ mapGridOpen: false, rmgOpen: false })
  },
  confirmGoToQuests: () => set({ noMapNoticeOpen: false, mapGridOpen: false, rmgOpen: false }),
  dismissNoMapNotice: () => set({ noMapNoticeOpen: false }),
  // Map Grid and Generate Random Map are mutually exclusive full-pane views
  // (AppShell's own mapGridOpen ? MapGrid : rmgOpen ? RMG : normal editor
  // ternary checks mapGridOpen first) — opening one must close the other,
  // otherwise triggering Generate Random Map while Map Grid is open leaves
  // mapGridOpen still true and the ternary never reaches the RMG branch.
  openMapGrid: () => set({ mapGridOpen: true, rmgOpen: false, startScreenOpen: false }),
  closeMapGrid: () => set({ mapGridOpen: false }),
  startScreenOpen: false,
  showStartScreen: () => set({ mapGridOpen: true, rmgOpen: false, startScreenOpen: true }),

  rmgOpen: false,
  openRmg: () => set({ rmgOpen: true, mapGridOpen: false }),
  // Random Map is opened from the Map tab, so closing it goes back there (the start screen when no map is loaded).
  closeRmg: () => set({ rmgOpen: false, mapGridOpen: true }),

  pendingGeneratedWarnings: null,
  reportGeneratedWarnings: (warnings) => set({ pendingGeneratedWarnings: warnings }),
  clearGeneratedWarnings: () => set({ pendingGeneratedWarnings: null }),

  pendingPick: null,
  requestPick: (pick) => set({ pendingPick: pick, mapGridOpen: true, startScreenOpen: false }),
  resolvePick: (value) => {
    const pick = get().pendingPick
    if (!pick) return
    pick.onResolve(value)
    set(
      pick.keepMapGridOpen
        ? { pendingPick: null }
        : { pendingPick: null, mapGridOpen: false, pendingResumeSelection: pick.resumeSelection ?? null },
    )
    pick.onFinish?.()
  },
  cancelPick: () => {
    const pick = get().pendingPick
    if (!pick) return
    set(
      pick.keepMapGridOpen
        ? { pendingPick: null }
        : { pendingPick: null, mapGridOpen: false, pendingResumeSelection: pick.resumeSelection ?? null },
    )
    pick.onFinish?.()
  },

  pendingSubjectSeed: null,
  requestSubjectFirst: (seed) => set({ pendingSubjectSeed: seed, mapGridOpen: false }),
  clearSubjectSeed: () => set({ pendingSubjectSeed: null }),

  pendingResumeSelection: null,
  clearPendingResumeSelection: () => set({ pendingResumeSelection: null }),

  pendingDatabaseFocus: null,
  openDatabaseItem: (tab, id) => set({ pendingDatabaseFocus: { tab, id, requestId: ++nextDatabaseFocusId } }),
  clearDatabaseFocus: () => set({ pendingDatabaseFocus: null }),
}))

// Loading any map (New, Open, Import, Random) clears the map context first (map-file.ts resetScenario), so that is the moment to leave the
// start screen and show the new map in the grid.
useMapContextStore.subscribe((s) => {
  if (s.context === null && useViewBridgeStore.getState().startScreenOpen) useViewBridgeStore.setState({ startScreenOpen: false })
})
