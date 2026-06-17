import { create } from 'zustand'
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

interface ScenarioStore {
  // Document state
  scenario: ScenarioFile
  isDirty: boolean

  // Selection state
  selectedType: SelectionType
  selectedPath: number[] // e.g. [questIdx, subQuestIdx, triggerIdx]

  // UI state
  panels: PanelsState

  // ── Document CRUD ────────────────────────────────────────────────────────
  setScenario: (scenario: ScenarioFile) => void
  resetScenario: () => void
  markClean: () => void

  // ── Counter operations ───────────────────────────────────────────────────
  addCounter: () => void
  updateCounter: (index: number, counter: Counter) => void
  removeCounter: (index: number) => void

  // ── Interruption operations ──────────────────────────────────────────────
  addInterruption: () => void
  updateInterruption: (index: number, interruption: Interruption) => void
  removeInterruption: (index: number) => void
  addInterruptionAction: (interruptionIndex: number) => void
  updateInterruptionAction: (interruptionIndex: number, actionIndex: number, action: Action) => void
  removeInterruptionAction: (interruptionIndex: number, actionIndex: number) => void

  // ── Quest operations ─────────────────────────────────────────────────────
  addQuest: () => void
  updateQuest: (questIndex: number, quest: Partial<Quest>) => void
  removeQuest: (questIndex: number) => void

  // ── SubQuest operations ──────────────────────────────────────────────────
  addSubQuest: (questIndex: number) => void
  updateSubQuest: (questIndex: number, subQuestIndex: number, subQuest: Partial<SubQuest>) => void
  removeSubQuest: (questIndex: number, subQuestIndex: number) => void

  // ── Trigger operations ───────────────────────────────────────────────────
  addTrigger: (questIndex: number, subQuestIndex: number) => void
  updateTrigger: (
    questIndex: number,
    subQuestIndex: number,
    triggerIndex: number,
    trigger: Partial<Trigger>,
  ) => void
  removeTrigger: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void

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
  addAction: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void
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

  // ── Panel toggles ─────────────────────────────────────────────────────────
  togglePanel: (panel: keyof PanelsState) => void
}

// ─── Store implementation ───────────────────────────────────────────────────────

export const useScenarioStore = create<ScenarioStore>((set) => ({
  scenario: EMPTY_SCENARIO,
  isDirty: false,
  selectedType: null,
  selectedPath: [],
  panels: { sidebar: true, editor: true, preview: true },

  // ── Document CRUD ──────────────────────────────────────────────────────────

  setScenario: (scenario) =>
    set({ scenario, isDirty: false, selectedType: null, selectedPath: [] }),

  resetScenario: () =>
    set({ scenario: EMPTY_SCENARIO, isDirty: false, selectedType: null, selectedPath: [] }),

  markClean: () => set({ isDirty: false }),

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

  addInterruptionAction: (interruptionIndex) =>
    set((s) => {
      const interruptions = [...s.scenario.interruptions]
      const interruption = { ...interruptions[interruptionIndex] }
      interruption.actions = [...interruption.actions, DEFAULT_ACTION()]
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

  // ── SubQuests ──────────────────────────────────────────────────────────────

  addSubQuest: (questIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      quest.subQuests = [...quest.subQuests, DEFAULT_SUBQUEST()]
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

  // ── Triggers ───────────────────────────────────────────────────────────────

  addTrigger: (questIndex, subQuestIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      subQuest.triggers = [...subQuest.triggers, DEFAULT_TRIGGER()]
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

  addAction: (questIndex, subQuestIndex, triggerIndex) =>
    set((s) => {
      const quests = [...s.scenario.quests]
      const quest = { ...quests[questIndex] }
      const subQuests = [...quest.subQuests]
      const subQuest = { ...subQuests[subQuestIndex] }
      const triggers = [...subQuest.triggers]
      const trigger = { ...triggers[triggerIndex] }
      trigger.actions = [...trigger.actions, DEFAULT_ACTION()]
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

  // ── Panel toggles ──────────────────────────────────────────────────────────

  togglePanel: (panel) =>
    set((s) => ({
      panels: { ...s.panels, [panel]: !s.panels[panel] },
    })),
}))
