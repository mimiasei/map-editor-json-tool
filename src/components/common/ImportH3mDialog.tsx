// ─── ImportH3mDialog (issue #207 Phase 6) ─────────────────────────────────────
// Tauri-only. Same idle → running → done/error phase shape as
// ThumbnailExtractDialog/SetupDialog. A single "Choose File & Import…"
// action runs the whole pipeline (pick .h3m → convert → validate → load as
// the current in-memory map); the "done" screen is the conversion-report
// surface the roadmap calls for — every named gap from convert-h3m-to-map.ts's
// own H3ImportReport, plus any structural validator finding, so the user
// always knows what was approximated or dropped rather than silently
// guessing at a "looks fine" map.

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { importH3mFile, type ImportH3mResult } from '@/lib/h3-import/import-h3m-file'
import { logError, logInfo } from '@/lib/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase = 'idle' | 'running' | 'done' | 'error'

function sortedCounts(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

export default function ImportH3mDialog({ open, onOpenChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ImportH3mResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleImport = async () => {
    setPhase('running')
    setErrorMsg('')
    try {
      const outcome = await importH3mFile()
      if (!outcome) { setPhase('idle'); return } // cancelled file picker
      logInfo(`Imported H3 map: ${outcome.name}`)
      setResult(outcome)
      setPhase('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Failed to import H3 map: ${msg}`)
      setErrorMsg(msg)
      setPhase('error')
    }
  }

  const handleClose = () => {
    if (phase === 'running') return
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    onOpenChange(false)
  }

  const report = result?.report ?? null
  const omitted = report ? sortedCounts(report.omittedReasonCounts) : []
  const variants = report ? sortedCounts(report.sceneryVariantCounts) : []
  const totalOmitted = omitted.reduce((sum, [, count]) => sum + count, 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Heroes 3 Map</DialogTitle>
        </DialogHeader>

        {/* ── Idle ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Convert a Heroes of Might and Magic 3 (.h3m) map into a new Olden Era map:
              terrain, decoration (with randomized visual variety), towns, monsters,
              resources, and — where the source map's win condition is supported —
              a working victory quest. The result opens as a new, unsaved map here in TSE;
              save it wherever you like afterward.
            </p>

            {!catalog && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  Load Game Data first (More → Game Data) so scenery and objects can be resolved.
                </AlertDescription>
              </Alert>
            )}

            {phase === 'error' && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Running ── */}
        {phase === 'running' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Converting…</span>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && result && report && (
          <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Imported "{report.sourceTitle || result.name}" — opened as a new map.
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>Map size</div>
              <div className="text-foreground">{report.atlasWidth} × {report.atlasHeight} (source {report.sourceSize}, {report.sourceLayers} layer{report.sourceLayers !== 1 ? 's' : ''})</div>
              <div>Players</div>
              <div className="text-foreground">{report.playersCount}</div>
              <div>Scenery placed</div>
              <div className="text-foreground">{report.sceneryPlaced}</div>
              <div>Other objects placed</div>
              <div className="text-foreground">{report.objectsPlaced}</div>
              <div>Victory quest</div>
              <div className="text-foreground">{report.hasVictoryQuest ? 'Yes (defeat all enemies)' : 'None (unsupported win condition)'}</div>
            </div>

            {report.unboundOrphanOwners.length > 0 && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {report.unboundOrphanOwners.length} player{report.unboundOrphanOwners.length !== 1 ? 's' : ''} had no town to bind to a start —
                  {' '}they have no start point on the converted map.
                </AlertDescription>
              </Alert>
            )}

            {report.outOfEnvelopeCount > 0 && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {report.outOfEnvelopeCount} object{report.outOfEnvelopeCount !== 1 ? 's' : ''} sat outside the source map's own bounds and were skipped.
                </AlertDescription>
              </Alert>
            )}

            {result.validationErrors.length > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs space-y-1">
                  <p>{result.validationErrors.length} structural validation issue{result.validationErrors.length !== 1 ? 's' : ''} found in the converted map:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {result.validationErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                  {result.validationErrors.length > 10 && <p>…and {result.validationErrors.length - 10} more.</p>}
                </AlertDescription>
              </Alert>
            )}

            {variants.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Scenery variety ({variants.length} kind{variants.length !== 1 ? 's' : ''})</summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {variants.map(([sid, count]) => (
                    <li key={sid} className="flex justify-between gap-2">
                      <span className="text-foreground truncate">{sid}</span>
                      <span className="text-muted-foreground shrink-0">{count}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {omitted.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Not converted ({totalOmitted} object{totalOmitted !== 1 ? 's' : ''}, {omitted.length} reason{omitted.length !== 1 ? 's' : ''})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {omitted.map(([reason, count]) => (
                    <li key={reason} className="flex justify-between gap-2">
                      <span className="text-foreground truncate">{reason}</span>
                      <span className="text-muted-foreground shrink-0">{count}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          {(phase === 'idle' || phase === 'error') && (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={!catalog}>
                Choose File &amp; Import…
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="ghost" disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Converting…
            </Button>
          )}
          {phase === 'done' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
