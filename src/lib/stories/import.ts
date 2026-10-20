// Turns the outline returned by the Rust `story_import` command into a StoryDef.
// Rust has already validated it; validateStoryDef is a second, cheap check so a
// bad outline can never reach the generator.

import type { BeatDef, StoryDef } from '@/types/story'
import type { StoryDraft } from '@/lib/text-writer'
import { TONES, type Tone } from '@/lib/script-templates/text-gen/phrases'
import { validateStoryDef } from './build'

export function draftToStoryDef(draft: StoryDraft): { def: StoryDef } | { error: string } {
  const notes: (string | undefined)[] = []
  const beats: BeatDef[] = []
  for (const b of draft.beats) {
    const { note, ...beat } = b
    notes.push(typeof note === 'string' && note ? note : undefined)
    beats.push(beat as unknown as BeatDef)
  }
  const tone: Tone = (TONES as readonly string[]).includes(draft.tone) ? (draft.tone as Tone) : 'heroic'
  const def: StoryDef = {
    id: 'my_idea',
    title: draft.title || 'My story',
    blurb: 'Built from your own idea.',
    tone,
    slots: draft.slots,
    variables: draft.variables as StoryDef['variables'],
    beats,
    notes,
  }
  const errors = validateStoryDef(def)
  return errors.length > 0 ? { error: errors[0] } : { def }
}
