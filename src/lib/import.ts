import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import { ScenarioFileSchema } from '@/schema/zod'

export interface ImportResult {
  scenario: ScenarioFile | null
  /** Editor-only extras extracted from _* keys (may all be defaults if absent) */
  mapName: string
  dialogs: Record<string, DialogFlow>
  localization: Record<string, string>
  /** Template metadata extracted from _templateMeta (null if not a template) */
  templateMeta: { id: string; name: string; description: string } | null
  /** Template annotations extracted from _annotations */
  annotations: Record<string, string>
  errors: string[]
  warnings: string[]
}

export function importScenario(jsonText: string): ImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const extras = {
    mapName: '',
    dialogs: {} as Record<string, DialogFlow>,
    localization: {} as Record<string, string>,
    templateMeta: null as { id: string; name: string; description: string } | null,
    annotations: {} as Record<string, string>,
  }

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
    return { scenario: null, ...extras, errors, warnings }
  }

  // ── Extract and strip editor-only _* keys ─────────────────────────────────
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>

    if (typeof r['_mapName'] === 'string') {
      extras.mapName = r['_mapName']
      delete r['_mapName']
    }
    if (r['_dialogs'] && typeof r['_dialogs'] === 'object') {
      extras.dialogs = r['_dialogs'] as Record<string, DialogFlow>
      delete r['_dialogs']
    }
    if (r['_localization'] && typeof r['_localization'] === 'object') {
      extras.localization = r['_localization'] as Record<string, string>
      delete r['_localization']
    }
    if (r['_templateMeta'] && typeof r['_templateMeta'] === 'object') {
      extras.templateMeta = r['_templateMeta'] as { id: string; name: string; description: string }
      delete r['_templateMeta']
    }
    if (r['_annotations'] && typeof r['_annotations'] === 'object') {
      extras.annotations = r['_annotations'] as Record<string, string>
      delete r['_annotations']
    }
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
      return { scenario, ...extras, errors, warnings }
    } catch {
      errors.push('Could not load scenario even with best-effort parsing.')
      return { scenario: null, ...extras, errors, warnings }
    }
  }

  return { scenario: result.data as ScenarioFile, ...extras, errors, warnings }
}
