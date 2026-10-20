// ─── Premade stories ───────────────────────────────────────────────────────────
// Original plots (inspired by classic mystery, invasion and hero tales; no
// borrowed names). Each has at least one real choice that changes the ending.

import type { StoryDef } from '@/types/story'
import { validateStoryDef } from './build'

const cursedMoor: StoryDef = {
  id: 'cursed_moor',
  title: 'The Cursed Moor',
  blurb: 'Strange lights and a missing heir. Follow the clues, then name the culprit.',
  tone: 'mysterious',
  slots: [
    { id: 'clue_sites', label: 'Clue sites', cardinality: 'many', min: 3, entityKind: 'object' },
    { id: 'showdown', label: 'Showdown location', cardinality: 'one', min: 1, entityKind: 'object' },
  ],
  variables: [
    { key: 'clues', label: 'Clues found', kind: 'progress', min: 0 },
    { key: 'accusation', label: 'Accusation made', kind: 'choice', min: 0, max: 4 },
    { key: 'deduction', label: 'Sound reasoning', kind: 'score', min: 0, max: 1 },
  ],
  beats: [
    { kind: 'intro' },
    { kind: 'visit', slot: 'clue_sites', variable: 'clues' },
    {
      kind: 'choice',
      variable: 'accusation',
      slot: 'showdown',
      answers: [
        {
          intent: 'cunning',
          consequences: [
            { kind: 'score', variable: 'deduction', amount: 1 },
            { kind: 'resource', resource: 'gold', amount: 500 },
          ],
        },
        { intent: 'bold', consequences: [{ kind: 'resource', resource: 'gold', amount: -300 }] },
        { intent: 'diplomatic', consequences: [] },
      ],
    },
    {
      kind: 'finale',
      victory: true,
      endings: [{ when: { variable: 'deduction', op: '>=', value: 1 } }, {}],
    },
  ],
}

const longSiege: StoryDef = {
  id: 'long_siege',
  title: 'The Long Siege',
  blurb: 'An enemy is coming. Decide how to prepare, then hold out until help arrives.',
  tone: 'grim',
  slots: [{ id: 'stronghold', label: 'Your stronghold', cardinality: 'one', min: 1, entityKind: 'town' }],
  variables: [
    { key: 'plan', label: 'Chosen plan', kind: 'choice', min: 0, max: 4 },
    { key: 'readiness', label: 'Readiness', kind: 'score', min: 0, max: 6 },
  ],
  beats: [
    { kind: 'intro' },
    {
      kind: 'choice',
      variable: 'plan',
      answers: [
        {
          intent: 'cautious',
          requiresGold: 500,
          consequences: [
            { kind: 'resource', resource: 'gold', amount: -500 },
            { kind: 'score', variable: 'readiness', amount: 3 },
          ],
        },
        {
          intent: 'greedy',
          consequences: [
            { kind: 'resource', resource: 'gold', amount: 400 },
            { kind: 'score', variable: 'readiness', amount: 1 },
          ],
        },
        { intent: 'cunning', consequences: [{ kind: 'score', variable: 'readiness', amount: 2 }] },
      ],
    },
    { kind: 'timer', days: 28 },
    {
      kind: 'finale',
      victory: true,
      endings: [{ when: { variable: 'readiness', op: '>=', value: 2 } }, {}],
    },
  ],
}

const borderOath: StoryDef = {
  id: 'border_oath',
  title: 'The Border Oath',
  blurb: 'Take a border town, choose how to treat its people, and face the warlord beyond.',
  tone: 'heroic',
  slots: [
    { id: 'border_town', label: 'Border town', cardinality: 'one', min: 1, entityKind: 'town' },
    { id: 'warlord', label: "Warlord's army", cardinality: 'one', min: 1, entityKind: 'squad' },
  ],
  variables: [
    { key: 'oath', label: 'Chosen oath', kind: 'choice', min: 0, max: 4 },
    { key: 'mercy', label: 'Mercy', kind: 'score', min: 0, max: 5 },
    { key: 'cruelty', label: 'Cruelty', kind: 'score', min: 0, max: 5 },
  ],
  beats: [
    { kind: 'intro' },
    { kind: 'capture', slot: 'border_town' },
    {
      kind: 'choice',
      variable: 'oath',
      answers: [
        { intent: 'merciful', consequences: [{ kind: 'score', variable: 'mercy', amount: 1 }] },
        {
          intent: 'bold',
          consequences: [
            { kind: 'score', variable: 'cruelty', amount: 1 },
            { kind: 'resource', resource: 'gold', amount: 300 },
          ],
        },
        {
          intent: 'diplomatic',
          consequences: [
            { kind: 'score', variable: 'mercy', amount: 1 },
            { kind: 'resource', resource: 'gold', amount: -100 },
          ],
        },
      ],
    },
    { kind: 'defeat', slot: 'warlord' },
    { kind: 'reward', resource: 'gold', amount: 1000 },
    {
      kind: 'finale',
      victory: true,
      endings: [
        { when: { variable: 'mercy', op: '>=', value: 1 } },
        { when: { variable: 'cruelty', op: '>=', value: 1 } },
        {},
      ],
    },
  ],
}

export const STORY_LIBRARY: StoryDef[] = [cursedMoor, longSiege, borderOath]

export function getStory(id: string): StoryDef | undefined {
  return STORY_LIBRARY.find((s) => s.id === id)
}

// A broken premade story is a bug in this file; fail loudly in development.
if (import.meta.env?.DEV) {
  for (const s of STORY_LIBRARY) {
    const errors = validateStoryDef(s)
    if (errors.length > 0) console.error(`Story "${s.id}" is invalid:\n- ${errors.join('\n- ')}`)
  }
}
