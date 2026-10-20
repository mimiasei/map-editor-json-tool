// ─── Story Builder types ───────────────────────────────────────────────────────
// A story is an ordered list of beats. Each beat generates ordinary quests,
// counters and dialog flows (no new runtime concept), merged into the project
// by useScenarioStore.appendGeneratedStory. Story state lives in integer
// counters ("story variables"); the wizard shows them by label, never by sid.

import type { Quest, Counter, Interruption } from './scenario'
import type { DialogFlow } from './dialog'

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
