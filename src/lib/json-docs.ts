// ─── JSON preview documents ───────────────────────────────────────────────────
// The JSON column can show more than the scenario file: one document per dialog,
// each rendered in the exact shape that ships inside the map ZIP. Keeping the
// serialization in dialog-file.ts means what the user reviews here is byte-for-byte
// what Export ZIP writes.

import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import { exportScenario } from '@/lib/export'
import { serializeDialogFile } from '@/lib/dialog-file'

/** Document id for the scenario itself. Dialog docs use `dialog:<id>`. */
export const SCENARIO_DOC_ID = 'scenario'

export interface JsonDoc {
  id: string
  kind: 'scenario' | 'dialog'
  /** Short label for the switcher. */
  label: string
  /** Where this document ends up on disk, shown under the switcher. */
  pathHint: string
  text: string
  /** Dialog flow id — only set for dialog docs. */
  dialogId?: string
}

export function dialogDocId(dialogId: string): string {
  return `dialog:${dialogId}`
}

/**
 * Build the document list for the JSON column. The scenario is always first;
 * dialogs follow in alphabetical order.
 */
export function buildJsonDocs(
  scenario: ScenarioFile,
  dialogs: Record<string, DialogFlow>,
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

  return docs
}
