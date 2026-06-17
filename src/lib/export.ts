import type { ScenarioFile } from '@/types/scenario'

/**
 * Serialize scenario to a tab-indented JSON string matching the game's format.
 */
export function exportScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, '\t')
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
