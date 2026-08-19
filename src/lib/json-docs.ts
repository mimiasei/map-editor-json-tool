// ─── JSON preview documents ───────────────────────────────────────────────────
// The JSON column can show more than the scenario file: one document per
// dialog, plus (issue #160) one for every other file the ZIP actually ships —
// localization/translations, custom heroes, custom map objects (+ their
// objects_logic clones), and custom artifacts (+ their ground-placement
// clones) — each rendered in the exact shape Export ZIP/Publish would write.
// Reusing the same collect/serialize helpers zip-export.ts uses
// (collectShippedSids, mapNameSnakeCase, resolveToken, serializeDialogFile)
// means what the user reviews and edits here is byte-for-byte what actually
// ships, not a separate approximation of it.

import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import type { CustomBuffDefinition } from '@/types/custom-buff'
import { exportScenario } from '@/lib/export'
import { serializeDialogFile } from '@/lib/dialog-file'
import { collectShippedSids, mapNameSnakeCase } from '@/lib/zip-export'
import { BASE_LANGUAGE, languageLabel, resolveToken, shippedLanguages, type TranslationMap } from '@/lib/languages'

/** Document id for the scenario itself. Dialog docs use `dialog:<id>`. */
export const SCENARIO_DOC_ID = 'scenario'

export interface JsonDoc {
  id: string
  kind:
    | 'scenario'
    | 'dialog'
    | 'localization'
    | 'customHero'
    | 'customMapObjectTemplates'
    | 'customMapObjectLogic'
    | 'customArtifactTemplates'
    | 'customArtifactMapObjects'
    | 'customBuffTemplates'
  /** Short label for the switcher. */
  label: string
  /** Where this document ends up on disk, shown under the switcher. */
  pathHint: string
  text: string
  /** Dialog flow id — only set for dialog docs. */
  dialogId?: string
  /** Language id — only set for localization docs. */
  lang?: string
  /** Hero sid — only set for customHero docs. */
  heroSid?: string
  /** Custom map object id — only set for customMapObjectLogic docs. */
  objectId?: string
}

export function dialogDocId(dialogId: string): string {
  return `dialog:${dialogId}`
}

/**
 * Build the document list for the JSON column. Order: scenario, dialogs
 * (alphabetical), localization (one per shipped language), custom heroes
 * (alphabetical), custom map object templates + one per object's logic
 * clone, custom artifact templates + their ground-placement clones. Batched
 * files (custom map object/artifact templates, artifact ground objects) are
 * only included when there's at least one entry — Export ZIP itself omits
 * them the same way (see zip-export.ts's `if (...length > 0)` guards).
 */
export function buildJsonDocs(
  scenario: ScenarioFile,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
  translations: TranslationMap,
  customHeroes: Record<string, CustomHeroDefinition>,
  customMapObjects: Record<string, CustomMapObjectDefinition>,
  customArtifacts: Record<string, CustomArtifactDefinition>,
  customBuffs: Record<string, CustomBuffDefinition>,
  mapName = '',
): JsonDoc[] {
  const docs: JsonDoc[] = [
    {
      id: SCENARIO_DOC_ID,
      kind: 'scenario',
      label: 'Map scenario',
      pathHint: '<map>.json',
      text: exportScenario(scenario),
    },
  ]

  const mapSegment = mapName.trim() || '<map>'
  for (const id of Object.keys(dialogs).sort()) {
    docs.push({
      id: dialogDocId(id),
      kind: 'dialog',
      label: id,
      pathHint: `DB/dialogs/dialogs/custom_maps/${mapSegment}/${id}.json`,
      text: serializeDialogFile(dialogs[id]),
      dialogId: id,
    })
  }

  // ── Localization / translations ─────────────────────────────────────────────
  const mapNameBase = mapNameSnakeCase(mapName)
  const sids = collectShippedSids(dialogs, localization, customHeroes, customMapObjects, customArtifacts, customBuffs)
  for (const lang of shippedLanguages(translations)) {
    const tokens = sids.map((sid) => ({ sid, text: resolveToken(sid, lang, localization, translations) }))
    const locFileName = lang === BASE_LANGUAGE ? `${mapNameBase}.json` : `${mapNameBase}_${lang}.json`
    docs.push({
      id: `localization:${lang}`,
      kind: 'localization',
      label: `Localization: ${languageLabel(lang)}`,
      pathHint: `Lang/${lang}/texts/${locFileName}`,
      text: JSON.stringify({ tokens }, null, '\t'),
      lang,
    })
  }

  // ── Custom heroes ────────────────────────────────────────────────────────────
  for (const heroSid of Object.keys(customHeroes).sort()) {
    docs.push({
      id: `customHero:${heroSid}`,
      kind: 'customHero',
      label: `Hero: ${heroSid}`,
      pathHint: `DB/heroes/custom_maps/${heroSid}.json`,
      text: JSON.stringify({ array: [customHeroes[heroSid].definition] }, null, '\t'),
      heroSid,
    })
  }

  // ── Custom map objects ───────────────────────────────────────────────────────
  const objectTemplates = Object.values(customMapObjects).map((o) => o.template)
  if (objectTemplates.length > 0) {
    docs.push({
      id: 'customMapObjectTemplates',
      kind: 'customMapObjectTemplates',
      label: 'Custom map objects',
      pathHint: `DB/map/objects/custom_maps/${mapNameBase}_objects.json`,
      text: JSON.stringify({ array: objectTemplates }, null, '\t'),
    })
  }
  for (const obj of Object.values(customMapObjects).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!obj.logic || !obj.logicSourcePath) continue
    docs.push({
      id: `customMapObjectLogic:${obj.id}`,
      kind: 'customMapObjectLogic',
      label: `Object logic: ${obj.id}`,
      pathHint: `DB/objects_logic/${obj.logicSourcePath}/${obj.id}.json`,
      text: JSON.stringify({ array: [obj.logic] }, null, '\t'),
      objectId: obj.id,
    })
  }

  // ── Custom artifacts ─────────────────────────────────────────────────────────
  const artifactTemplates = Object.values(customArtifacts).map((a) => a.template)
  if (artifactTemplates.length > 0) {
    docs.push({
      id: 'customArtifactTemplates',
      kind: 'customArtifactTemplates',
      label: 'Custom artifacts',
      pathHint: `DB/items/items/custom_maps/${mapNameBase}_artifacts.json`,
      text: JSON.stringify({ array: artifactTemplates }, null, '\t'),
    })
  }
  const artifactMapObjects = Object.values(customArtifacts)
    .map((a) => a.mapObjectTemplate)
    .filter((t): t is Record<string, unknown> => t !== undefined)
  if (artifactMapObjects.length > 0) {
    docs.push({
      id: 'customArtifactMapObjects',
      kind: 'customArtifactMapObjects',
      label: 'Custom artifact ground objects',
      pathHint: `DB/map/objects/custom_maps/${mapNameBase}_artifact_objects.json`,
      text: JSON.stringify({ array: artifactMapObjects }, null, '\t'),
    })
  }

  // ── Custom buffs ──────────────────────────────────────────────────────────
  const buffTemplates = Object.values(customBuffs).map((b) => b.template)
  if (buffTemplates.length > 0) {
    docs.push({
      id: 'customBuffTemplates',
      kind: 'customBuffTemplates',
      label: 'Custom buffs',
      pathHint: `DB/buffs/custom_maps/${mapNameBase}_buffs.json`,
      text: JSON.stringify({ array: buffTemplates }, null, '\t'),
    })
  }

  return docs
}
