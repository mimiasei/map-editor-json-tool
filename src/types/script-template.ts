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

import type { Quest, Counter } from './scenario'
import type { MapContext } from './map-context'

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

export interface ScriptTemplateInput {
  /** slot id -> picked map-entity SIDs, in pick order */
  slots: Record<string, string[]>
  /** param id -> numeric value */
  params: Record<string, number>
}

export interface ScriptTemplateGenerateResult {
  quest: Quest
  counters?: Counter[]
}

export interface ScriptTemplateDef {
  id: string
  name: string
  description: string
  category: string
  slots: ScriptTemplateSlot[]
  params?: ScriptTemplateNumberParam[]
  /** Returns user-facing error strings; empty array = ready to generate. */
  validate: (input: ScriptTemplateInput, mapContext: MapContext | null) => string[]
  /** Only ever called after validate() returns no errors, so mapContext is non-null here. */
  generate: (
    input: ScriptTemplateInput,
    mapContext: MapContext,
    existingSids: { quests: string[]; counters: string[] },
  ) => ScriptTemplateGenerateResult
}
