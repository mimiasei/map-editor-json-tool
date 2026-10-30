// "Build my own": the user stacks beats from a palette and this turns the list
// into a StoryDef (slots, variables and choice presets are created for them).

import type { BeatDef, ChoiceAnswerDef, StoryDef, StorySlotDef, StoryVariableDef } from '@/types/story'
import type { Tone } from '@/lib/script-templates/text-gen/phrases'

export type CustomBeatKind = 'intro' | 'visit' | 'capture' | 'defeat' | 'resources' | 'timer' | 'reward' | 'choice'

export const CUSTOM_BEAT_KINDS: CustomBeatKind[] = ['intro', 'visit', 'capture', 'defeat', 'resources', 'timer', 'reward', 'choice']

export const CHOICE_PRESETS = ['mercy', 'trade', 'approach'] as const
export type ChoicePreset = (typeof CHOICE_PRESETS)[number]

export interface CustomBeat {
  kind: CustomBeatKind
  /** choice beats only */
  preset?: ChoicePreset
  /** gold amount for resources / reward, number of days for timer */
  amount?: number
}

export const DEFAULT_AMOUNTS: Partial<Record<CustomBeatKind, number>> = {
  resources: 5000,
  timer: 14,
  reward: 1000,
}

function presetAnswers(preset: ChoicePreset): { answers: ChoiceAnswerDef[]; scores: string[] } {
  switch (preset) {
    case 'mercy':
      return {
        scores: ['mercy', 'cruelty'],
        answers: [
          { intent: 'merciful', consequences: [{ kind: 'score', variable: 'mercy', amount: 1 }] },
          {
            intent: 'bold',
            consequences: [
              { kind: 'score', variable: 'cruelty', amount: 1 },
              { kind: 'resource', resource: 'gold', amount: 300 },
            ],
          },
        ],
      }
    case 'trade':
      return {
        scores: ['prepared'],
        answers: [
          {
            intent: 'cautious',
            requiresGold: 500,
            consequences: [
              { kind: 'resource', resource: 'gold', amount: -500 },
              { kind: 'score', variable: 'prepared', amount: 2 },
            ],
          },
          { intent: 'greedy', consequences: [{ kind: 'resource', resource: 'gold', amount: 400 }] },
        ],
      }
    case 'approach':
      return {
        scores: ['bold_path', 'clever_path'],
        answers: [
          { intent: 'bold', consequences: [{ kind: 'score', variable: 'bold_path', amount: 1 }] },
          { intent: 'cautious', consequences: [] },
          { intent: 'cunning', consequences: [{ kind: 'score', variable: 'clever_path', amount: 1 }] },
        ],
      }
  }
}

const SCORE_LABELS: Record<string, string> = {
  mercy: 'Mercy',
  cruelty: 'Cruelty',
  prepared: 'Preparedness',
  bold_path: 'Bold deeds',
  clever_path: 'Clever deeds',
}

export function buildCustomStory(beats: CustomBeat[], tone: Tone): StoryDef {
  const slots: StorySlotDef[] = []
  const variables: StoryVariableDef[] = []
  const def: BeatDef[] = []
  const counts: Record<string, number> = {}
  const next = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)
  const scoreKeys: string[] = []

  for (const b of beats) {
    switch (b.kind) {
      case 'intro':
        def.push({ kind: 'intro' })
        break
      case 'timer':
        def.push({ kind: 'timer', days: b.amount ?? DEFAULT_AMOUNTS.timer! })
        break
      case 'resources':
        def.push({ kind: 'resources', resource: 'gold', amount: b.amount ?? DEFAULT_AMOUNTS.resources! })
        break
      case 'reward':
        def.push({ kind: 'reward', resource: 'gold', amount: b.amount ?? DEFAULT_AMOUNTS.reward! })
        break
      case 'visit': {
        const n = next('visit')
        const slot = `visit_${n}`
        const variable = `visit_${n}_count`
        slots.push({ id: slot, label: `Places to visit (part ${n})`, cardinality: 'many', min: 2, entityKind: 'object' })
        variables.push({ key: variable, label: `Places visited (part ${n})`, kind: 'progress', min: 0 })
        def.push({ kind: 'visit', slot, variable })
        break
      }
      case 'capture': {
        const n = next('capture')
        const slot = `capture_${n}`
        slots.push({ id: slot, label: n > 1 ? `Town to capture ${n}` : 'Town to capture', cardinality: 'one', min: 1, entityKind: 'town' })
        def.push({ kind: 'capture', slot })
        break
      }
      case 'defeat': {
        const n = next('defeat')
        const slot = `defeat_${n}`
        slots.push({ id: slot, label: n > 1 ? `Army to defeat ${n}` : 'Army to defeat', cardinality: 'one', min: 1, entityKind: 'squad' })
        def.push({ kind: 'defeat', slot })
        break
      }
      case 'choice': {
        const n = next('choice')
        const { answers, scores } = presetAnswers(b.preset ?? 'mercy')
        const variable = `choice_${n}`
        variables.push({ key: variable, label: `Choice ${n}`, kind: 'choice', min: 0, max: 4 })
        for (const s of scores) {
          if (!variables.some((v) => v.key === s)) {
            variables.push({ key: s, label: SCORE_LABELS[s] ?? s, kind: 'score', min: 0, max: 8 })
          }
          if (!scoreKeys.includes(s)) scoreKeys.push(s)
        }
        def.push({ kind: 'choice', variable, answers })
        break
      }
    }
  }

  // The ending reacts to the scores the player could earn (up to four), if any.
  const endings = [
    ...scoreKeys.slice(0, 4).map((key) => ({ when: { variable: key, op: '>=' as const, value: 1 } })),
    {},
  ]
  def.push({ kind: 'finale', endings, victory: true })

  return {
    id: 'my_story',
    title: 'My story',
    blurb: 'A story you put together from beats.',
    tone,
    slots,
    variables,
    beats: def,
  }
}
