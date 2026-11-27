// ─── H3 import progress reporting ────────────────────────────────────────────
// Same shape as the RMG's `RmgProgressCallback` (a status-line label and 0-100) for the shared `ProgressStatus` bar. The conversion is one
// long synchronous call stack per stage, so every report waits for a repaint (`yieldToUI`); without it the bar would only jump from 0 to 100.

import i18n from '@/lib/i18n'
import { yieldToUI } from '@/lib/async-utils'

export type H3ImportProgress = (label: string, pct: number) => void

export type H3ImportStage =
  | 'readingMap' | 'terrain' | 'objects' | 'decoration' | 'players' | 'reachability' | 'fixing' | 'validating' | 'loading' | 'done'

/** Where each stage starts (the percentages the converter and importer report), for `nextStagePct`. */
const STAGE_START_PCTS = [0, 8, 18, 30, 42, 58, 78, 90, 96, 100]

/** The start of the stage after the one at `pct`: the bar creeps towards just short of it while the stage runs. */
export function nextStagePct(pct: number): number {
  return STAGE_START_PCTS.find((start) => start > pct) ?? 100
}

function stageLabel(stage: H3ImportStage): string {
  switch (stage) {
    case 'readingMap': return i18n.t('common.importH3mDialog.progress.readingMap')
    case 'terrain': return i18n.t('common.importH3mDialog.progress.terrain')
    case 'objects': return i18n.t('common.importH3mDialog.progress.objects')
    case 'decoration': return i18n.t('common.importH3mDialog.progress.decoration')
    case 'players': return i18n.t('common.importH3mDialog.progress.players')
    case 'reachability': return i18n.t('common.importH3mDialog.progress.reachability')
    case 'fixing': return i18n.t('common.importH3mDialog.progress.fixing')
    case 'validating': return i18n.t('common.importH3mDialog.progress.validating')
    case 'loading': return i18n.t('common.importH3mDialog.progress.loading')
    case 'done': return i18n.t('common.importH3mDialog.progress.done')
  }
}

export async function reportH3Stage(onProgress: H3ImportProgress | undefined, stage: H3ImportStage, pct: number): Promise<void> {
  if (!onProgress) return
  onProgress(stageLabel(stage), pct)
  await yieldToUI()
}
