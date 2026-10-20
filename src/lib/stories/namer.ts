// Generates the sids a story needs: quests, counters, dialogs and localization
// tokens. Everything is prefixed `{mapSnake}_{story}_...` and checked for
// collisions against the project and against what this namer already handed
// out, because addon zips share one global sid pool (see CLAUDE.md).

import { mapNameSnakeCase } from '@/lib/zip-export'

export interface ExistingStorySids {
  quests: string[]
  counters: string[]
  interruptions: string[]
  dialogs: string[]
  tokens: string[]
}

export interface StoryNamer {
  /** `{map}_{story}` prefix every sid starts with. */
  prefix: string
  quest: (name: string) => string
  counter: (name: string) => string
  interruption: (name: string) => string
  dialog: (name: string) => string
  /** Token sid for a piece of text, e.g. `token('intro_dialog', 'text')`. */
  token: (owner: string, part: string) => string
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x'
}

export function createStoryNamer(
  mapName: string,
  storyId: string,
  existing: ExistingStorySids,
): StoryNamer {
  const prefix = `${mapNameSnakeCase(mapName)}_${slug(storyId)}`
  const taken = {
    quests: new Set(existing.quests),
    counters: new Set(existing.counters),
    interruptions: new Set(existing.interruptions),
    dialogs: new Set(existing.dialogs),
    tokens: new Set(existing.tokens),
  }

  function mint(set: Set<string>, name: string): string {
    const base = `${prefix}_${slug(name)}`
    let sid = base
    let n = 2
    while (set.has(sid)) sid = `${base}_${n++}`
    set.add(sid)
    return sid
  }

  return {
    prefix,
    quest: (name) => mint(taken.quests, name),
    counter: (name) => mint(taken.counters, name),
    interruption: (name) => mint(taken.interruptions, name),
    dialog: (name) => mint(taken.dialogs, name),
    token: (owner, part) => mint(taken.tokens, `${owner}_${part}`),
  }
}
