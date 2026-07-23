// ─── Core types matching the HoMM Olden Era scenario JSON format ───────────────

export interface ScenarioFile {
  counters: Counter[]
  interruptions: Interruption[]
  quests: Quest[]
}

export interface Counter {
  sid: string
  value: number
}

export type InterruptionType = 'BeforeIamVsHero' | 'AfterIamWinVsHero'

export interface Interruption {
  sid: string
  interruption: InterruptionType | string
  activeOnStart: boolean
  p: string[]
  actions: Action[]
}

export interface Quest {
  sid: string
  main?: boolean
  hidden?: boolean
  comment?: string
  activeOnStart: boolean
  name?: string
  sharing?: string
  subQuests: SubQuest[]
}

export interface SubQuest {
  sid: string
  activeOnStart: boolean
  name?: string
  comment?: string
  triggers: Trigger[]
}

export interface Trigger {
  conditionsLogic?: 'And' | 'Or'
  repeat?: boolean
  conditions: Condition[]
  actions: Action[]
}

export interface Condition {
  c: string
  p?: string[]
  counter?: number // Extra property seen on StartTurn
}

export interface Action {
  a: string
  p?: string[]
  break?: boolean
}

// ─── Selection state ────────────────────────────────────────────────────────────

export type SelectionType =
  | 'counter'
  | 'interruption'
  | 'quest'
  | 'subquest'
  | 'trigger'
  | null
