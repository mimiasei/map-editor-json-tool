import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'

/**
 * Serialize scenario to a tab-indented JSON string matching the game's format.
 * Strips editor-only _* keys — safe to pass directly to the game.
 */
export function exportScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, '\t')
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
): string {
  const project: Record<string, unknown> = {
    ...scenario,
    ...(mapName ? { _mapName: mapName } : {}),
    ...(Object.keys(dialogs).length > 0 ? { _dialogs: dialogs } : {}),
    ...(Object.keys(localization).length > 0 ? { _localization: localization } : {}),
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
