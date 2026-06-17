import type { ScenarioFile } from '@/types/scenario'
import { ScenarioFileSchema } from '@/schema/zod'

export interface ImportResult {
  scenario: ScenarioFile | null
  errors: string[]
  warnings: string[]
}

export function importScenario(jsonText: string): ImportResult {
  const errors: string[] = []
  const warnings: string[] = []

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
    return { scenario: null, errors, warnings }
  }

  const result = ScenarioFileSchema.safeParse(raw)

  if (!result.success) {
    // Report Zod errors as warnings (permissive import — load anyway if possible)
    for (const issue of result.error.issues) {
      warnings.push(`${issue.path.join('.')}: ${issue.message}`)
    }

    // Try a best-effort load: cast raw to ScenarioFile with fallbacks
    try {
      const r = raw as Record<string, unknown>
      const scenario: ScenarioFile = {
        counters: Array.isArray(r['counters']) ? (r['counters'] as ScenarioFile['counters']) : [],
        interruptions: Array.isArray(r['interruptions'])
          ? (r['interruptions'] as ScenarioFile['interruptions'])
          : [],
        quests: Array.isArray(r['quests']) ? (r['quests'] as ScenarioFile['quests']) : [],
      }
      return { scenario, errors, warnings }
    } catch {
      errors.push('Could not load scenario even with best-effort parsing.')
      return { scenario: null, errors, warnings }
    }
  }

  return { scenario: result.data as ScenarioFile, errors, warnings }
}
