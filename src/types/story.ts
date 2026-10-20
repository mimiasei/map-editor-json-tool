// ─── Story Builder types ───────────────────────────────────────────────────────
// A story is an ordered list of beats. Each beat generates ordinary quests,
// counters and dialog flows (no new runtime concept), merged into the project
// by useScenarioStore.appendGeneratedStory. Story state lives in integer
// counters ("story variables"); the wizard shows them by label, never by sid.

import type { Quest, Counter, Interruption } from './scenario'
import type { DialogFlow } from './dialog'
import type { Tone } from '@/lib/script-templates/text-gen/phrases'

/** The kinds of piece of text a story needs written. Used to pick phrases and,
 *  when the text writer is enabled, to build the (hidden) request. */
export const TEXT_KINDS = [
  'quest_name',
  'quest_desc',
  'intro',
  'clue',
  'choice_prompt',
  'answer',
  'outcome',
  'reward',
  'finale',
] as const
export type TextKind = (typeof TEXT_KINDS)[number]

/** What an answer tries to be. Drives answer wording and default consequences. */
export const ANSWER_INTENTS = ['bold', 'cautious', 'diplomatic', 'greedy', 'merciful', 'cunning'] as const
export type AnswerIntent = (typeof ANSWER_INTENTS)[number]

export const TEXT_LENGTHS = ['short', 'medium'] as const
export type TextLength = (typeof TEXT_LENGTHS)[number]

/** One piece of text the story needs. `id` is the localization token sid the
 *  text will be stored under; names/places in `context` come from the map. */
export interface TextSpec {
  id: string
  kind: TextKind
  tone: string
  length: TextLength
  /** Who speaks (display name from the map or a role such as "narrator"). */
  speaker?: string
  intent?: AnswerIntent
  /** Short name -> value facts the text may mention (town, hero, item names). */
  context: Record<string, string>
}

/** What a story variable (integer counter) is for. Purely descriptive; every
 *  kind is just a Counter underneath. */
export const VARIABLE_KINDS = ['choice', 'score', 'progress', 'timer', 'random'] as const
export type VariableKind = (typeof VARIABLE_KINDS)[number]

/** A counter the story owns, with a friendly label for the wizard. */
export interface StoryVariable {
  /** Counter sid (prefixed and unique, see stories/namer.ts). */
  sid: string
  /** Friendly name shown in the wizard, e.g. "Trust". */
  label: string
  kind: VariableKind
  min?: number
  max?: number
}

/** Everything a generator hands back; merged into the project on Create. */
export interface GeneratedStory {
  quests: Quest[]
  counters: Counter[]
  interruptions: Interruption[]
  dialogFlows: DialogFlow[]
  /** token sid -> English text (the base language). */
  localizationTokens: Record<string, string>
  /** Text requests, in the same order the tokens were created. */
  textSpecs: TextSpec[]
  variables: StoryVariable[]
}

export const EMPTY_GENERATED_STORY = (): GeneratedStory => ({
  quests: [],
  counters: [],
  interruptions: [],
  dialogFlows: [],
  localizationTokens: {},
  textSpecs: [],
  variables: [],
})

// ─── Story definitions (authoring side) ────────────────────────────────────────

/** A map entity the user binds a story slot to (towns, objects, squads). */
export interface StorySlotDef {
  id: string
  label: string
  /** 'one' = a single entity; 'many' = a list (e.g. several clue sites). */
  cardinality: 'one' | 'many'
  /** Minimum picks needed for the story to be buildable. */
  min: number
  /** Hint for auto-suggestion from the map ('town', 'object', 'squad'). */
  entityKind: 'town' | 'object' | 'squad'
}

/** What a choice answer does besides recording which answer was picked. */
export type Consequence =
  | { kind: 'score'; variable: string; amount: number }
  | { kind: 'resource'; resource: string; amount: number }

export interface ChoiceAnswerDef {
  intent: AnswerIntent
  consequences: Consequence[]
  /** Only offered while the player holds at least this much gold. */
  requiresGold?: number
}

/** An ending shown by a finale beat, picked by a counter condition (first match
 *  wins, so order the specific ones first). `when` undefined = the fallback. */
export interface EndingDef {
  when?: { variable: string; op: '=' | '>' | '<' | '>=' | '<='; value: number }
  speaker?: string
}

export type BeatDef =
  | { kind: 'intro' }
  | { kind: 'visit'; slot: string; variable: string }
  | { kind: 'capture'; slot: string }
  | { kind: 'defeat'; slot: string }
  | { kind: 'resources'; resource: string; amount: number }
  | { kind: 'timer'; days: number }
  | { kind: 'reward'; resource: string; amount: number }
  | {
      kind: 'choice'
      /** Counter that records which answer was picked (1-based). */
      variable: string
      /** Optionally held at a slot object: the dialog opens when visiting it. */
      slot?: string
      answers: ChoiceAnswerDef[]
    }
  | { kind: 'finale'; endings: EndingDef[]; victory: boolean }

/** A story variable declared by the story; beats refer to it by `key`. */
export interface StoryVariableDef {
  key: string
  label: string
  kind: VariableKind
  min?: number
  max?: number
}

export interface StoryDef {
  id: string
  title: string
  blurb: string
  tone: Tone
  slots: StorySlotDef[]
  variables: StoryVariableDef[]
  beats: BeatDef[]
}

/** Everything the user decided in the wizard. */
export interface StoryInput {
  /** slot id -> entity sids */
  slots: Record<string, string[]>
  tone: Tone
  length: TextLength
  seed: number
}

/** Map facts the generators need (names for text, existing sids for collisions). */
export interface StoryEnv {
  mapName: string
  /** entity sid -> display name for text ("Ravenhold"); falls back to a humanized sid. */
  entityNames: Record<string, string>
}
