// ─── Script Templates (issue #149) ─────────────────────────────────────────────
// A "script template" is a reusable recipe that generates real quest/trigger
// scripting from a small set of user picks (existing placed objects on the
// current map) plus a few numeric params. Unlike src/data/templates/*.json
// (which load a whole ScenarioFile and replace the current project), a
// script template's output gets MERGED into the current project via
// useScenarioStore's appendGeneratedContent — see ScriptTemplateDialog.tsx.
//
// This exists to let map authors replicate classic HoMM3 map objects that
// Olden Era has no native equivalent for (e.g. Hut of the Magi / Eye of the
// Magi, src/lib/script-templates/hut-of-the-magi.ts) purely through existing
// scripting vocabulary — no new native object types involved.

import type { ReactNode } from 'react'
import type { Quest, Counter } from './scenario'
import type { MapContext } from './map-context'
import type { DialogFlow } from './dialog'

export interface ScriptTemplateExistingSids {
  quests: string[]
  counters: string[]
  dialogs: string[]
}

export type SlotCardinality = 'one' | 'many'

export interface ScriptTemplateSlot {
  /** Key into ScriptTemplateInput.slots, e.g. 'huts' */
  id: string
  label: string
  description?: string
  /** 'many' renders an unbounded add/remove list (EntityPickerList); 'one' a single picker. */
  cardinality: SlotCardinality
}

export interface ScriptTemplateNumberParam {
  /** Key into ScriptTemplateInput.params, e.g. 'radius' */
  id: string
  label: string
  defaultValue: number
  min?: number
  max?: number
}

export interface ScriptTemplateStringParam {
  /** Key into ScriptTemplateInput.fields, e.g. 'keyCounterSid' */
  id: string
  label: string
  placeholder?: string
  /** Default false — the common case is an optional dialog/VFX sid. */
  required?: boolean
}

export interface ScriptTemplateInput {
  /** slot id -> picked map-entity SIDs, in pick order (generic 'many'/'one' pickers) */
  slots: Record<string, string[]>
  /** param id -> numeric value (generic number inputs) */
  params: Record<string, number>
  /**
   * Free-form string values. Rendered automatically as plain text inputs for
   * any `stringParams` entries (the generic case — e.g. an optional dialog
   * sid). Also used as backing storage for templates with type-dependent
   * dynamic fields that provide their own renderFields instead (e.g. an
   * enum-selected quest/reward TYPE that changes which further fields
   * apply — see seers-hut.ts).
   */
  fields: Record<string, string>
}

export interface ScriptTemplateGenerateResult {
  quest: Quest
  counters?: Counter[]
  /** New DialogFlow to merge in, for templates that need one (e.g. sphinx.tsx's
   *  multiple-choice riddle) — merged via setDialogFlow, same as any other dialog. */
  dialogFlow?: DialogFlow
  /** sid -> text, merged via setLocalizationBatch. For any new loc tokens the
   *  generated content references (e.g. riddle/answer text) that don't already
   *  exist elsewhere in the project. */
  localizationTokens?: Record<string, string>
}

export interface ScriptTemplateFieldsProps {
  input: ScriptTemplateInput
  setInput: (updater: (prev: ScriptTemplateInput) => ScriptTemplateInput) => void
  mapContext: MapContext | null
}

export interface ScriptTemplateDef {
  id: string
  name: string
  description: string
  category: string
  /** Generic slot pickers (mapEntity lists), rendered automatically by ScriptTemplateDialog.
   *  Leave empty ([]) for templates that render everything via renderFields instead. */
  slots: ScriptTemplateSlot[]
  params?: ScriptTemplateNumberParam[]
  /** Generic plain-text inputs (e.g. an optional dialog/VFX sid), rendered
   *  automatically alongside slots/params. Ignored by templates that
   *  provide renderFields instead. */
  stringParams?: ScriptTemplateStringParam[]
  /**
   * Optional custom step-2 form. When provided, the dialog renders this
   * INSTEAD of the generic slots/params UI — for templates with type-dependent
   * dynamic fields (e.g. "quest type" changing which further inputs show)
   * that don't fit the generic renderer. Simple templates (fixed set of
   * object-list slots + plain numbers, e.g. hut-of-the-magi.ts) don't need
   * this at all.
   */
  renderFields?: (props: ScriptTemplateFieldsProps) => ReactNode
  /** Returns user-facing error strings; empty array = ready to generate. */
  validate: (
    input: ScriptTemplateInput,
    mapContext: MapContext | null,
    existingSids: ScriptTemplateExistingSids,
  ) => string[]
  /** Only ever called after validate() returns no errors. mapContext may still be
   *  null for templates (like seers-hut.ts) that never need map positions. */
  generate: (
    input: ScriptTemplateInput,
    mapContext: MapContext | null,
    existingSids: ScriptTemplateExistingSids,
  ) => ScriptTemplateGenerateResult
}
