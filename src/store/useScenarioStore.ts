import { create } from 'zustand'
import { temporal } from 'zundo'
import { useMapContextStore } from '@/store/useMapContextStore'
import type {
  ScenarioFile,
  Counter,
  Interruption,
  Quest,
  SubQuest,
  Trigger,
  Condition,
  Action,
  SelectionType,
} from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import type { TranslationMap } from '@/lib/languages'

// ─── Empty defaults ─────────────────────────────────────────────────────────────

export const EMPTY_SCENARIO: ScenarioFile = {
  counters: [],
  interruptions: [],
  quests: [],
}

const DEFAULT_COUNTER = (): Counter => ({ sid: 'new_counter', value: 0 })

const DEFAULT_INTERRUPTION = (): Interruption => ({
  sid: 'new_interruption',
  interruption: 'BeforeIamVsHero',
  activeOnStart: true,
  p: [],
  actions: [],
})

const DEFAULT_QUEST = (): Quest => ({
  sid: 'new_quest',
  activeOnStart: true,
  sharing: 'Clone',
  subQuests: [],
})

const DEFAULT_SUBQUEST = (): SubQuest => ({
  sid: '1',
  activeOnStart: true,
  triggers: [],
})

const DEFAULT_TRIGGER = (): Trigger => ({
  conditionsLogic: 'And',
  conditions: [],
  actions: [],
})

const DEFAULT_CONDITION = (): Condition => ({ c: 'StartTurn', p: [] })

const DEFAULT_ACTION = (): Action => ({ a: 'Dialog', p: [''] })

// ─── Store interface ────────────────────────────────────────────────────────────

interface PanelsState {
  sidebar: boolean
  editor: boolean
  preview: boolean
}

/**
 * Everything needed to populate the editor with a project. Optional fields are
 * reset to their empty defaults when omitted, so hydrating never leaves data from
 * a previously open project behind.
 */
export interface ProjectPayload {
  scenario: ScenarioFile
  mapName?: string
  dialogs?: Record<string, DialogFlow>
  localization?: Record<string, string>
  translations?: TranslationMap
  customHeroes?: Record<string, CustomHeroDefinition>
  customMapObjects?: Record<string, CustomMapObjectDefinition>
  customArtifacts?: Record<string, CustomArtifactDefinition>
  currentFilePath?: string | null
  currentFileName?: string | null
  mapFilePath?: string | null
  sidecarPath?: string | null
  /** Restored sessions carry their unsaved state; fresh loads start clean. */
  isDirty?: boolean
  /** Same, for zipDirty (issue #160) — see its own doc comment below. */
  zipDirty?: boolean
}

interface ScenarioStore {
  // Document state
  scenario: ScenarioFile
  isDirty: boolean
  /** issue #160: distinct from isDirty — true only when something that
   *  actually ships inside the exported ZIP (custom heroes/objects/
   *  artifacts, dialogs, localization) changed since the last Export ZIP/
   *  Publish. A plain project Save clears isDirty but NOT this — the ZIP on
   *  disk is still stale until re-exported/published. Drives the "Publish"
   *  header button's needs-attention indicator. */
  zipDirty: boolean
  currentFilePath: string | null   // absolute path (Tauri) or '' (browser)
  currentFileName: string | null   // display name, e.g. "my_map.json"
  /** Absolute path to the source .map binary (null if opened from bare JSON) */
  mapFilePath: string | null
  /** Absolute path to the sidecar .json to write on save (same as currentFilePath when .map was opened) */
  sidecarPath: string | null

  // Map meta / dialog / localization (editor-only, stored as _* in project JSON)
  mapName: string
  dialogs: Record<string, DialogFlow>       // keyed by dialog ID
  localization: Record<string, string>      // SID → English text (the base language)
  /** Non-English tokens, keyed by game language id then SID. */
  translations: TranslationMap
  /** Non-English languages this map has opted into (may still be empty). */
  activeLanguages: string[]
  /** Custom hero identities (issue #139), keyed by the new heroSid each one
   *  ships under. Editor-only, stored as _customHeroes in project JSON. */
  customHeroes: Record<string, CustomHeroDefinition>
  /** Custom map object identities (issue #146), keyed by the new object id
   *  each one ships under. Editor-only, stored as _customMapObjects in
   *  project JSON. */
  customMapObjects: Record<string, CustomMapObjectDefinition>
  /** Custom artifact identities (issue #150), keyed by the new artifact id
   *  each one ships under. Editor-only, stored as _customArtifacts in
   *  project JSON. */
  customArtifacts: Record<string, CustomArtifactDefinition>

  // Selection state
  selectedType: SelectionType
  selectedPath: number[] // e.g. [questIdx, subQuestIdx, triggerIdx]

  // UI state
  panels: PanelsState
  sidebarWidth: number // pixel width of the sidebar panel; updated via ResizeObserver in AppShell

  // ── Document CRUD ────────────────────────────────────────────────────────
  setScenario: (scenario: ScenarioFile) => void
  resetScenario: () => void
  markClean: () => void
  /** Called after a successful Export ZIP or Publish — see zipDirty's own doc comment. */
  markZipPublished: () => void
  setCurrentFile: (path: string | null, name: string | null) => void
  setMapFile: (mapPath: string, sidecarPath: string) => void
  /** Load a whole project in one shot (import, template load, session restore). */
  hydrateProject: (payload: ProjectPayload) => void

  // ── Map meta / dialog / localization ────────────────────────────────────
  setMapName: (name: string) => void
  setDialogFlow: (id: string, flow: DialogFlow) => void
  removeDialogFlow: (id: string) => void
  setLocalizationToken: (sid: string, text: string) => void
  removeLocalizationToken: (sid: string) => void
  /** Move a token's text (and every language's translation of it) from
   *  oldSid to newSid in one step — used when editing an entity's naming SID
   *  so it updates the existing token instead of leaving it orphaned behind
   *  a freshly-created one (issue #133). No-ops the move when oldSid === newSid. */
  renameLocalizationToken: (oldSid: string, newSid: string, newText: string) => void
  setLocalizationBatch: (tokens: Record<string, string>) => void
  setTranslationToken: (lang: string, sid: string, text: string) => void
  setTranslationBatch: (lang: string, tokens: Record<string, string>) => void
  setTranslations: (translations: TranslationMap) => void
  addLanguage: (lang: string) => void
  removeLanguage: (lang: string) => void

  // ── Custom hero identities (issue #139) ──────────────────────────────────
  setCustomHero: (heroSid: string, definition: CustomHeroDefinition) => void
  removeCustomHero: (heroSid: string) => void

  // ── Custom map object identities (issue #146) ────────────────────────────
  setCustomMapObject: (id: string, definition: CustomMapObjectDefinition) => void
  removeCustomMapObject: (id: string) => void

  // ── Custom artifact identities (issue #150) ──────────────────────────────
  setCustomArtifact: (id: string, definition: CustomArtifactDefinition) => void
  removeCustomArtifact: (id: string) => void

  // ── Counter operations ───────────────────────────────────────────────────
  addCounter: () => void
  updateCounter: (index: number, counter: Counter) => void
  removeCounter: (index: number) => void
  duplicateCounter: (index: number) => void

  // ── Interruption operations ──────────────────────────────────────────────
  addInterruption: () => void
  updateInterruption: (index: number, interruption: Interruption) => void
  removeInterruption: (index: number) => void
  addInterruptionAction: (interruptionIndex: number, action?: Action) => void
  updateInterruptionAction: (interruptionIndex: number, actionIndex: number, action: Action) => void
  removeInterruptionAction: (interruptionIndex: number, actionIndex: number) => void
  duplicateInterruption: (index: number) => void

  // ── Quest operations ─────────────────────────────────────────────────────
  addQuest: () => void
  updateQuest: (questIndex: number, quest: Partial<Quest>) => void
  removeQuest: (questIndex: number) => void
  duplicateQuest: (questIndex: number) => void
  /** Merges a script-template-generated Quest (and any Counters it needs) into
   *  the current project in one set() call, so undo removes it in one step. */
  appendGeneratedContent: (quest: Quest, counters: Counter[]) => void

  // ── SubQuest operations ──────────────────────────────────────────────────
  addSubQuest: (questIndex: number, subQuest?: SubQuest) => void
  updateSubQuest: (questIndex: number, subQuestIndex: number, subQuest: Partial<SubQuest>) => void
  removeSubQuest: (questIndex: number, subQuestIndex: number) => void
  duplicateSubQuest: (questIndex: number, subQuestIndex: number) => void

  // ── Trigger operations ───────────────────────────────────────────────────
  addTrigger: (questIndex: number, subQuestIndex: number, trigger?: Trigger) => void
  updateTrigger: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    trigger: Partial<Trigger>,
  ) => void
  removeTrigger: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void
  duplicateTrigger: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void

  // ── Condition operations ─────────────────────────────────────────────────
  addCondition: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void
  updateCondition: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    conditionIndex: number,
    condition: Condition,
  ) => void
  removeCondition: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    conditionIndex: number,
  ) => void

  // ── Action operations (triggers) ─────────────────────────────────────────
  addAction: (questIndex: number, subQuestIndex: number, triggerIndex: number, action?: Action) => void
  updateAction: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    actionIndex: number,
    action: Action,
  ) => void
  removeAction: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    actionIndex: number,
  ) => void

  // ── Selection ────────────────────────────────────────────────────────────
  setSelection: (type: SelectionType, path: number[]) => void
  clearSelection: () => void

  // ── UI modal state ───────────────────────────────────────────────────────────
  dialogEditorOpenId: string | null
  localizationDialogOpen: boolean
  /** Set by openLocalizationFor(); LocalizationDialog reads this once on open to
   *  pre-filter to a specific token, then clears it so a later manual open isn't
   *  still filtered. */
  localizationFocusSid: string | null
  openDialogEditor: (id: string) => void
  closeDialogEditor: () => void
  setLocalizationDialogOpen: (open: boolean) => void
  /** Open the Localization panel already filtered to a single token — used by the
   *  Dialog Editor so editing a slide's text doesn't require a manual search. */
  openLocalizationFor: (sid: string) => void
  clearLocalizationFocus: () => void

  // ── Panel toggles ─────────────────────────────────────────────────────────
  togglePanel: (panel: keyof PanelsState) => void
  setSidebarWidth: (width: number) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Return a SID that doesn't collide with existingSids.
 *  Strips any trailing _copy / _copy2 / _copy3 … suffix first so cloning
 *  a clone never accumulates _copy_copy. */
export function uniqueSid(sid: string, existingSids: string[]): string {
  const base = sid.replace(/_copy\d*$/, '')
  const taken = new Set(existingSids)
  let candidate = base + '_copy'
  if (!taken.has(candidate)) return candidate
  let n = 2
  while (taken.has(base + '_copy' + n)) n++
  return base + '_copy' + n
}

// ─── Store implementation ───────────────────────────────────────────────────────

export const useScenarioStore = create<ScenarioStore>()(
  temporal(
    (set) => ({
  scenario: EMPTY_SCENARIO,
  isDirty: false,
  zipDirty: false,
  currentFilePath: null,
  currentFileName: null,
  mapFilePath: null,
  sidecarPath: null,
  mapName: '',
  dialogs: {},
  localization: {},
  translations: {},
  activeLanguages: [],
  customHeroes: {},
  customMapObjects: {},
  customArtifacts: {},
  dialogEditorOpenId: null,
  localizationDialogOpen: false,
  localizationFocusSid: null,
  selectedType: null,
  selectedPath: [],
  panels: { sidebar: true, editor: true, preview: true },
  sidebarWidth: 280,

  // ── Document CRUD ──────────────────────────────────────────────────────────

  setScenario: (scenario) => {
    set({ scenario, isDirty: false, zipDirty: false, selectedType: null, selectedPath: [] })
    useScenarioStore.temporal.getState().clear()
  },

  resetScenario: () => {
    set({ scenario: EMPTY_SCENARIO, isDirty: false, zipDirty: false, currentFilePath: null, currentFileName: null, mapFilePath: null, sidecarPath: null, mapName: '', dialogs: {}, localization: {}, translations: {}, activeLanguages: [], customHeroes: {}, customMapObjects: {}, customArtifacts: {}, selectedType: null, selectedPath: [] })
    useScenarioStore.temporal.getState().clear()
    useMapContextStore.getState().clearContext()
  },

  markClean: () => set({ isDirty: false }),
  markZipPublished: () => set({ zipDirty: false }),

  setCurrentFile: (path, name) => set({ currentFilePath: path, currentFileName: name }),

  setMapFile: (mapPath, sidecarPath) => set({ mapFilePath: mapPath, sidecarPath }),

  hydrateProject: (payload) => {
    set({
      scenario: payload.scenario,
      mapName: payload.mapName ?? '',
      dialogs: payload.dialogs ?? {},
      localization: payload.localization ?? {},
      translations: payload.translations ?? {},
      activeLanguages: Object.keys(payload.translations ?? {}).sort(),
      customHeroes: payload.customHeroes ?? {},
      customMapObjects: payload.customMapObjects ?? {},
      customArtifacts: payload.customArtifacts ?? {},
      currentFilePath: payload.currentFilePath ?? null,
      currentFileName: payload.currentFileName ?? null,
      mapFilePath: payload.mapFilePath ?? null,
      sidecarPath: payload.sidecarPath ?? null,
      isDirty: payload.isDirty ?? false,
      zipDirty: payload.zipDirty ?? false,
      selectedType: null,
      selectedPath: [],
    })
    // A hydrated project is a new document — undoing into the previous one would
    // silently mix two projects together.
    useScenarioStore.temporal.getState().clear()
  },

  // ── Map meta / dialog / localization ────────────────────────────────────────

  setMapName: (name) => set({ mapName: name, isDirty: true }),

  // These six (through setLocalizationBatch) all also set zipDirty — every
  // one of them changes data that actually ships inside the exported ZIP
  // (dialogs, localization tokens), distinct from isDirty's much broader
  // "the project has unsaved edits" (see zipDirty's own doc comment).
  setDialogFlow: (id, flow) =>
    set((s) => ({ dialogs: { ...s.dialogs, [id]: flow }, isDirty: true, zipDirty: true })),

  removeDialogFlow: (id) =>
    set((s) => {
      const dialogs = { ...s.dialogs }
      delete dialogs[id]
      return { dialogs, isDirty: true, zipDirty: true }
    }),

  setLocalizationToken: (sid, text) =>
    set((s) => ({ localization: { ...s.localization, [sid]: text }, isDirty: true, zipDirty: true })),

  removeLocalizationToken: (sid) =>
    set((s) => {
      const localization = { ...s.localization }
      delete localization[sid]
      // Also strip every language's translation of this SID — previously
      // left orphaned forever, since only the English map was ever touched.
      const translations: TranslationMap = {}
      for (const [lang, tokens] of Object.entries(s.translations)) {
        const t = { ...tokens }
        delete t[sid]
        translations[lang] = t
      }
      return { localization, translations, isDirty: true, zipDirty: true }
    }),

  renameLocalizationToken: (oldSid, newSid, newText) =>
    set((s) => {
      if (oldSid === newSid) {
        return { localization: { ...s.localization, [newSid]: newText }, isDirty: true, zipDirty: true }
      }
      const localization = { ...s.localization }
      delete localization[oldSid]
      localization[newSid] = newText

      const translations: TranslationMap = {}
      for (const [lang, tokens] of Object.entries(s.translations)) {
        const t = { ...tokens }
        const oldValue = t[oldSid]
        delete t[oldSid]
        if (oldValue !== undefined) t[newSid] = oldValue
        translations[lang] = t
      }
      return { localization, translations, isDirty: true, zipDirty: true }
    }),

  setLocalizationBatch: (tokens) =>
    set((s) => ({ localization: { ...s.localization, ...tokens }, isDirty: true, zipDirty: true })),

  setTranslationToken: (lang, sid, text) =>
    set((s) => ({
      translations: { ...s.translations, [lang]: { ...(s.translations[lang] ?? {}), [sid]: text } },
      activeLanguages: s.activeLanguages.includes(lang)
        ? s.activeLanguages
        : [...s.activeLanguages, lang],
      isDirty: true,
    })),

  setTranslationBatch: (lang, tokens) =>
    set((s) => ({
      translations: { ...s.translations, [lang]: { ...(s.translations[lang] ?? {}), ...tokens } },
      activeLanguages: s.activeLanguages.includes(lang)
        ? s.activeLanguages
        : [...s.activeLanguages, lang],
      isDirty: true,
    })),

  // Used on import — replaces wholesale and derives the active language list.
  setTranslations: (translations) =>
    set({ translations, activeLanguages: Object.keys(translations).sort() }),

  addLanguage: (lang) =>
    set((s) =>
      s.activeLanguages.includes(lang)
        ? s
        : {
            activeLanguages: [...s.activeLanguages, lang],
            translations: { ...s.translations, [lang]: s.translations[lang] ?? {} },
            isDirty: true,
          },
    ),

  removeLanguage: (lang) =>
    set((s) => {
      const translations = { ...s.translations }
      delete translations[lang]
      return {
        translations,
        activeLanguages: s.activeLanguages.filter((l) => l !== lang),
        isDirty: true,
      }
    }),

  // ── Custom hero identities ───────────────────────────────────────────────────
  // All six of these (through removeCustomArtifact) also set zipDirty — each
  // ships its own file into the exported ZIP (DB/heroes|map/objects|items/
  // custom_maps/*), so this is exactly the "DB json changes" issue #160 means.

  setCustomHero: (heroSid, definition) =>
    set((s) => ({ customHeroes: { ...s.customHeroes, [heroSid]: definition }, isDirty: true, zipDirty: true })),

  removeCustomHero: (heroSid) =>
    set((s) => {
      const customHeroes = { ...s.customHeroes }
      delete customHeroes[heroSid]
      return { customHeroes, isDirty: true, zipDirty: true }
    }),

  // ── Custom map object identities ─────────────────────────────────────────────

  setCustomMapObject: (id, definition) =>
    set((s) => ({ customMapObjects: { ...s.customMapObjects, [id]: definition }, isDirty: true, zipDirty: true })),

  removeCustomMapObject: (id) =>
    set((s) => {
      const customMapObjects = { ...s.customMapObjects }
      delete customMapObjects[id]
      return { customMapObjects, isDirty: true, zipDirty: true }
    }),

  // ── Custom artifact identities ───────────────────────────────────────────────

  setCustomArtifact: (id, definition) =>
    set((s) => ({ customArtifacts: { ...s.customArtifacts, [id]: definition }, isDirty: true, zipDirty: true })),

  removeCustomArtifact: (id) =>
    set((s) => {
      const customArtifacts = { ...s.customArtifacts }
      delete customArtifacts[id]
      return { customArtifacts, isDirty: true, zipDirty: true }
    }),

  // ── Counters ───────────────────────────────────────────────────────────────

  addCounter: () =>
    set((s) => ({
      scenario: { ...s.scenario, counters: [...s.scenario.counters, DEFAULT_COUNTER()] },
      isDirty: true,
    })),

  updateCounter: (index, counter) =>
    set((s) => {
      const counters = [...s.scenario.counters]
      counters[index] = counter
      return { scenario: { ...s.scenario, counters }, isDirty: true }
    }),

  removeCounter: (index) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        counters: s.scenario.counters.filter((_, i) => i !== index),
      },
      isDirty: true,
      selectedType: s.selectedType === 'counter' && s.selectedPath[0] === index ? null : s.selectedType,
      selectedPath: s.selectedType === 'counter' && s.selectedPath[0] === index ? [] : s.selectedPath,
    })),

  duplicateCounter: (index) =>
    set((s) => {
      const clone = JSON.parse(JSON.stringify(s.scenario.counters[index]))
      clone.sid = uniqueSid(clone.sid, s.scenario.counters.map((c) => c.sid))
      const counters = [...s.scenario.counters]
      counters.splice(index + 1, 0, clone)
      const newSelectedPath =
        s.selectedType === 'counter' && s.selectedPath[0] > index
          ? [s.selectedPath[0] + 1]
          : s.selectedPath
      return { scenario: { ...s.scenario, counters }, isDirty: true, selectedPath: newSelectedPath }
    }),

  // ── Interruptions ──────────────────────────────────────────────────────────

  addInterruption: () =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        interruptions: [...s.scenario.interruptions, DEFAULT_INTERRUPTION()],
      },
      isDirty: true,
    })),

  updateInterruption: (index, interruption) =>
    set((s) => {
      const interruptions = [...s.scenario.interruptions]
      interruptions[index] = interruption
      return { scenario: { ...s.scenario, interruptions }, isDirty: true }
    }),

  removeInterruption: (index) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        interruptions: s.scenario.interruptions.filter((_, i) => i !== index),
      },
      isDirty: true,
      selectedType:
        s.selectedType === 'interruption' && s.selectedPath[0] === index ? null : s.selectedType,
      selectedPath:
        s.selectedType === 'interruption' && s.selectedPath[0] === index ? [] : s.selectedPath,
    })),

  duplicateInterruption: (index) =>
    set((s) => {
      const clone = JSON.parse(JSON.stringify(s.scenario.interruptions[index]))
      clone.sid = uniqueSid(clone.sid, s.scenario.interruptions.map((i) => i.sid))
      const interruptions = [...s.scenario.interruptions]
      interruptions.splice(index + 1, 0, clone)
      const newSelectedPath =
        s.selectedType === 'interruption' && s.selectedPath[0] > index
          ? [s.selectedPath[0] + 1]
          : s.selectedPath
      return { scenario: { ...s.scenario, interruptions }, isDirty: true, selectedPath: newSelectedPath }
    }),

  addInterruptionAction: (interruptionIndex, action) =>
    set((s) => {
      const interruptions = [...s.scenario.interruptions]
      const interruption = { ...interruptions[interruptionIndex] }
      interruption.actions = [...interruption.actions, action ?? DEFAULT_ACTION()]
      interruptions[interruptionIndex] = interruption
      return { scenario: { ...s.scenario, interruptions }, isDirty: true }
    }),

  updateInterruptionAction: (interruptionIndex, actionIndex, action) =>
    set((s) => {
      const interruptions = [...s.scenario.interruptions]
      const interruption = { ...interruptions[interruptionIndex] }
      const actions = [...interruption.actions]
      actions[actionIndex] = action
      interruption.actions = actions
      interruptions[interruptionIndex] = interruption
      return { scenario: { ...s.scenario, interruptions }, isDirty: true }
    }),

  removeInterruptionAction: (interruptionIndex, actionIndex) =>
    set((s) => {
      const interruptions = [...s.scenario.interruptions]
      const interruption = { ...interruptions[interruptionIndex] }
      interruption.actions = interruption.actions.filter((_, i) => i !== actionIndex)
      interruptions[interruptionIndex] = interruption
      return { scenario: { ...s.scenario, interruptions }, isDirty: true }
    }),

  // ── Quests ─────────────────────────────────────────────────────────────────

  addQuest: () =>
    set((s) => ({
      scenario: { ...s.scenario, quests: [...s.scenario.quests, DEFAULT_QUEST()] },
      isDirty: true,
    })),

  appendGeneratedContent: (quest, counters) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        quests: [...s.scenario.quests, quest],
        counters: [...s.scenario.counters, ...counters],
      },
      isDirty: true,
    })),

  updateQuest: (questIndex, quest) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      quests[questIndex] = { ...quests[questIndex], ...quest }
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  removeQuest: (questIndex) =>
    set((s) => ({
      scenario: {
        ...s.scenario,
        quests: s.scenario.quests.filter((_, i) => i !== questIndex),
      },
      isDirty: true,
      selectedType:
        s.selectedType !== null &&
        ['quest', 'subquest', 'trigger'].includes(s.selectedType) &&
        s.selectedPath[0] === questIndex
          ? null
          : s.selectedType,
      selectedPath:
        s.selectedType !== null &&
        ['quest', 'subquest', 'trigger'].includes(s.selectedType) &&
        s.selectedPath[0] === questIndex
          ? []
          : s.selectedPath,
    })),

  duplicateQuest: (questIndex) =>
    set((s) => {
      const clone = JSON.parse(JSON.stringify(s.scenario.quests[questIndex]))
      clone.sid = uniqueSid(clone.sid, s.scenario.quests.map((q) => q.sid))
      const quests = [...s.scenario.quests]
      quests.splice(questIndex + 1, 0, clone)
      const newSelectedPath =
        s.selectedType !== null &&
        ['quest', 'subquest', 'trigger'].includes(s.selectedType) &&
        s.selectedPath[0] > questIndex
          ? [s.selectedPath[0] + 1, ...s.selectedPath.slice(1)]
          : s.selectedPath
      return { scenario: { ...s.scenario, quests }, isDirty: true, selectedPath: newSelectedPath }
    }),

  // ── SubQuests ──────────────────────────────────────────────────────────────

  addSubQuest: (questIndex, subQuest) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      quest.subQuests = [...quest.subQuests, subQuest ?? DEFAULT_SUBQUEST()]
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  updateSubQuest: (questIndex, subQuestIndex, subQuest) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      subQuests[subQuestIndex] = { ...subQuests[subQuestIndex], ...subQuest }
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  removeSubQuest: (questIndex, subQuestIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      quest.subQuests = quest.subQuests.filter((_, i) => i !== subQuestIndex)
      quests[questIndex] = quest
      return {
        scenario: { ...s.scenario, quests },
        isDirty: true,
        selectedType:
          s.selectedType !== null &&
          ['subquest', 'trigger'].includes(s.selectedType) &&
          s.selectedPath[0] === questIndex &&
          s.selectedPath[1] === subQuestIndex
            ? null
            : s.selectedType,
        selectedPath:
          s.selectedType !== null &&
          ['subquest', 'trigger'].includes(s.selectedType) &&
          s.selectedPath[0] === questIndex &&
          s.selectedPath[1] === subQuestIndex
            ? []
            : s.selectedPath,
      }
    }),

  duplicateSubQuest: (questIndex, subQuestIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const clone = JSON.parse(JSON.stringify(quest.subQuests[subQuestIndex]))
      clone.sid = uniqueSid(clone.sid, quest.subQuests.map((sq) => sq.sid))
      const subQuests = [...quest.subQuests]
      subQuests.splice(subQuestIndex + 1, 0, clone)
      quest.subQuests = subQuests
      quests[questIndex] = quest
      const newSelectedPath =
        s.selectedType !== null &&
        ['subquest', 'trigger'].includes(s.selectedType) &&
        s.selectedPath[0] === questIndex &&
        s.selectedPath[1] > subQuestIndex
          ? [s.selectedPath[0], s.selectedPath[1] + 1, ...s.selectedPath.slice(2)]
          : s.selectedPath
      return { scenario: { ...s.scenario, quests }, isDirty: true, selectedPath: newSelectedPath }
    }),

  // ── Triggers ───────────────────────────────────────────────────────────────

  addTrigger: (questIndex, subQuestIndex, trigger) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      subQuest.triggers = [...subQuest.triggers, trigger ?? DEFAULT_TRIGGER()]
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  updateTrigger: (questIndex, subQuestIndex, triggerIndex, trigger) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      triggers[triggerIndex] = { ...triggers[triggerIndex], ...trigger }
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  removeTrigger: (questIndex, subQuestIndex, triggerIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      subQuest.triggers = subQuest.triggers.filter((_, i) => i !== triggerIndex)
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return {
        scenario: { ...s.scenario, quests },
        isDirty: true,
        selectedType:
          s.selectedType === 'trigger' &&
          s.selectedPath[0] === questIndex &&
          s.selectedPath[1] === subQuestIndex &&
          s.selectedPath[2] === triggerIndex
            ? null
            : s.selectedType,
        selectedPath:
          s.selectedType === 'trigger' &&
          s.selectedPath[0] === questIndex &&
          s.selectedPath[1] === subQuestIndex &&
          s.selectedPath[2] === triggerIndex
            ? []
            : s.selectedPath,
      }
    }),

  duplicateTrigger: (questIndex, subQuestIndex, triggerIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const clone = JSON.parse(JSON.stringify(subQuest.triggers[triggerIndex]))
      const triggers = [...subQuest.triggers]
      triggers.splice(triggerIndex + 1, 0, clone)
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      const newSelectedPath =
        s.selectedType === 'trigger' &&
        s.selectedPath[0] === questIndex &&
        s.selectedPath[1] === subQuestIndex &&
        s.selectedPath[2] > triggerIndex
          ? [s.selectedPath[0], s.selectedPath[1], s.selectedPath[2] + 1]
          : s.selectedPath
      return { scenario: { ...s.scenario, quests }, isDirty: true, selectedPath: newSelectedPath }
    }),

  // ── Conditions ─────────────────────────────────────────────────────────────

  addCondition: (questIndex, subQuestIndex, triggerIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      trigger.conditions = [...trigger.conditions, DEFAULT_CONDITION()]
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  updateCondition: (questIndex, subQuestIndex, triggerIndex, conditionIndex, condition) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      const conditions = [...trigger.conditions]
      conditions[conditionIndex] = condition
      trigger.conditions = conditions
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  removeCondition: (questIndex, subQuestIndex, triggerIndex, conditionIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      trigger.conditions = trigger.conditions.filter((_, i) => i !== conditionIndex)
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  // ── Actions (triggers) ─────────────────────────────────────────────────────

  addAction: (questIndex, subQuestIndex, triggerIndex, action) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      trigger.actions = [...trigger.actions, action ?? DEFAULT_ACTION()]
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  updateAction: (questIndex, subQuestIndex, triggerIndex, actionIndex, action) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      const actions = [...trigger.actions]
      actions[actionIndex] = action
      trigger.actions = actions
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  removeAction: (questIndex, subQuestIndex, triggerIndex, actionIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      trigger.actions = trigger.actions.filter((_, i) => i !== actionIndex)
      triggers[triggerIndex] = trigger
      subQuest.triggers = triggers
      subQuests[subQuestIndex] = subQuest
      quest.subQuests = subQuests
      quests[questIndex] = quest
      return { scenario: { ...s.scenario, quests }, isDirty: true }
    }),

  // ── Selection ──────────────────────────────────────────────────────────────

  setSelection: (type, path) => set({ selectedType: type, selectedPath: path }),

  clearSelection: () => set({ selectedType: null, selectedPath: [] }),

  openDialogEditor: (id) => set({ dialogEditorOpenId: id }),
  closeDialogEditor: () => set({ dialogEditorOpenId: null }),
  setLocalizationDialogOpen: (open) => set({ localizationDialogOpen: open }),

  openLocalizationFor: (sid) =>
    set({ localizationDialogOpen: true, localizationFocusSid: sid }),

  clearLocalizationFocus: () => set({ localizationFocusSid: null }),

  // ── Panel toggles ──────────────────────────────────────────────────────────

  togglePanel: (panel) =>
    set((s) => ({
      panels: { ...s.panels, [panel]: !s.panels[panel] },
    })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
    }),
    {
      partialize: (state) => ({ scenario: state.scenario }),
      equality: (a, b) => a.scenario === b.scenario,
      limit: 100,
    },
  ),
)
