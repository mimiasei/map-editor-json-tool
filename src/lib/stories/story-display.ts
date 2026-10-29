// What the story wizard shows in the UI language. The English titles, slot labels and variable labels in library.ts and
// custom-story.ts stay as they are: variable labels are stored in the map (counter comments), so only display goes through here.
import i18n from '@/lib/i18n'
import type { CustomBeatKind, ChoicePreset } from './custom-story'

export function beatLabel(kind: CustomBeatKind): string {
  return i18n.t(`story.customBeats.${kind}.label`)
}

export function beatHint(kind: CustomBeatKind): string {
  return i18n.t(`story.customBeats.${kind}.hint`)
}

export function presetLabel(preset: ChoicePreset): string {
  return i18n.t(`story.choicePresets.${preset}`)
}

export function storyTitle(def: { id: string; title: string }): string {
  const key = `story.display.titles.${def.id}`
  return i18n.exists(key) ? i18n.t(key as 'story.display.titles.my_story') : def.title
}

export function storyBlurb(def: { id: string; blurb: string }): string {
  const key = `story.display.blurbs.${def.id}`
  return i18n.exists(key) ? i18n.t(key as 'story.display.blurbs.my_story') : def.blurb
}

/** Premade slots have a fixed id; custom stories number theirs (`visit_2`, `capture_1`, ...). */
export function slotLabel(slot: { id: string; label: string }): string {
  const premade = `story.display.slots.${slot.id}`
  if (i18n.exists(premade)) return i18n.t(premade as 'story.display.slots.showdown')
  const m = /^(visit|capture|defeat)_(\d+)$/.exec(slot.id)
  if (!m) return slot.label
  const n = Number(m[2])
  if (m[1] === 'visit') return i18n.t('story.display.customSlots.visit', { n })
  if (m[1] === 'capture') return n > 1 ? i18n.t('story.display.customSlots.captureN', { n }) : i18n.t('story.display.customSlots.capture')
  return n > 1 ? i18n.t('story.display.customSlots.defeatN', { n }) : i18n.t('story.display.customSlots.defeat')
}
