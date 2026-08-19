import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import type { CustomBuffDefinition } from '@/types/custom-buff'
import type { TranslationMap } from '@/lib/languages'

/**
 * Serialize scenario to a tab-indented JSON string matching the game's format.
 * Strips editor-only _* keys — safe to pass directly to the game.
 */
export function exportScenario(scenario: ScenarioFile): string {
  // Strip any _* keys that may have leaked into the scenario object
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(scenario)) {
    if (!k.startsWith('_')) clean[k] = v
  }
  return JSON.stringify(clean, null, '\t')
}

/**
 * Serialize the full project (scenario + editor-only _* metadata) to JSON.
 * Use this for Save / Save As so localization and dialog data round-trips.
 */
export function exportProjectJson(
  scenario: ScenarioFile,
  mapName: string,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
  translations: TranslationMap = {},
  customHeroes: Record<string, CustomHeroDefinition> = {},
  customMapObjects: Record<string, CustomMapObjectDefinition> = {},
  customArtifacts: Record<string, CustomArtifactDefinition> = {},
  customBuffs: Record<string, CustomBuffDefinition> = {},
): string {
  const project: Record<string, unknown> = {
    ...scenario,
    ...(mapName ? { _mapName: mapName } : {}),
    ...(Object.keys(dialogs).length > 0 ? { _dialogs: dialogs } : {}),
    ...(Object.keys(localization).length > 0 ? { _localization: localization } : {}),
    // Omitted entirely when there are no extra languages, so files saved by
    // English-only projects stay byte-identical to before.
    ...(Object.keys(translations).length > 0 ? { _translations: translations } : {}),
    ...(Object.keys(customHeroes).length > 0 ? { _customHeroes: customHeroes } : {}),
    ...(Object.keys(customMapObjects).length > 0 ? { _customMapObjects: customMapObjects } : {}),
    ...(Object.keys(customArtifacts).length > 0 ? { _customArtifacts: customArtifacts } : {}),
    ...(Object.keys(customBuffs).length > 0 ? { _customBuffs: customBuffs } : {}),
  }
  return JSON.stringify(project, null, '\t')
}

/**
 * Trigger a browser download of the JSON string.
 */
export function downloadJson(json: string, filename = 'scenario.json'): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
