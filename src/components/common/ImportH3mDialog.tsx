// ─── ImportH3mDialog (issue #207 Phase 6) ─────────────────────────────────────
// Tauri-only. Same idle → running → done/error phase shape as
// ThumbnailExtractDialog/SetupDialog. A single "Choose File & Import…"
// action runs the whole pipeline (pick .h3m → convert → validate → load as
// the current in-memory map); the "done" screen is the conversion-report
// surface the roadmap calls for — every named gap from convert-h3m-to-map.ts's
// own H3ImportReport, plus any structural validator finding, so the user
// always knows what was approximated or dropped rather than silently
// guessing at a "looks fine" map.

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { importH3mFile, type ImportH3mResult } from '@/lib/h3-import/import-h3m-file'
import { describeH3ObjectId } from '@/lib/h3-import/h3-object-mapping'
import { logError, logInfo } from '@/lib/logger'
import { saveFile } from '@/lib/native-fs'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase = 'idle' | 'running' | 'done' | 'error'

function sortedCounts(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

const UNMAPPED_ID_REASON = /^unmapped_template_object_id_(\d+)$/

/** Same bare-localStorage-key "don't show this again" convention as
 *  SetupDialog.tsx's `'oe-setup-shown'` — checked on open to skip straight
 *  to the file picker instead of the intro/credits screen. */
const INTRO_SHOWN_KEY = 'oe-import-h3m-intro-shown'

/** Every other omit reason is already a descriptive slug (`witch_hut_deferred`,
 *  `boat_no_stock_objectconfig`, ...) — only the generic "no mapping table
 *  entry at all" reason carries a bare numeric id, decoded here via the same
 *  master table the converter itself resolves against. */
function describeOmitReason(reason: string): string {
  const match = UNMAPPED_ID_REASON.exec(reason)
  return match ? `Unmapped: ${describeH3ObjectId(Number(match[1]))}` : reason
}

/** Same information as the "done" screen below, as plain text — for the
 *  "Save report…" button. Deliberately its own file rather than mixed into
 *  Tauri's own app log (tauri-plugin-log's rotating file): that log is a
 *  diagnostic trail for every feature, not a per-import artifact a user
 *  would want to find, keep, or attach to a bug report on its own. */
function buildReportText(result: ImportH3mResult): string {
  const { report } = result
  const omitted = sortedCounts(report.omittedReasonCounts)
  const variants = sortedCounts(report.sceneryVariantCounts)
  const sourceObjects = sortedCounts(report.sourceObjectCounts)
  const totalOmitted = omitted.reduce((sum, [, count]) => sum + count, 0)

  const lines: string[] = []
  lines.push(`H3 map import report`)
  lines.push(`Imported "${report.sourceTitle || result.name}" -> ${result.name}`)
  lines.push('')
  lines.push(`Map size: ${report.atlasWidth} x ${report.atlasHeight} (source ${report.sourceSize}, ${report.sourceLayers} layer${report.sourceLayers !== 1 ? 's' : ''})`)
  lines.push(`Players: ${report.playersCount}`)
  lines.push(`Scenery placed: ${report.sceneryPlaced}`)
  lines.push(`Other objects placed: ${report.objectsPlaced}`)
  lines.push(`River tiles: ${report.riverTilesConverted}`)
  lines.push(`Victory quest: ${report.hasVictoryQuest ? 'Yes (defeat all enemies)' : 'None (unsupported win condition)'}`)
  lines.push(`Portals linked: ${report.portalsLinked}`)
  lines.push(`Accessibility fixes: ${report.accessibilityDecorRemoved} removed, ${report.accessibilityTargetsNudged} nudged`)
  lines.push(`Ground-truth floor fixes: ${report.groundTruthDecorRemoved} removed (of ${report.groundTruthTilesChecked} floor tiles checked against the source map's own passability)`)

  if (report.groundTruthStillBlocked > 0) {
    lines.push('')
    lines.push(`WARNING: ${report.groundTruthStillBlocked} tile${report.groundTruthStillBlocked !== 1 ? 's' : ''} the source map's own data says should be walkable floor remain${report.groundTruthStillBlocked === 1 ? 's' : ''} unreachable — no decorative object was found nearby to safely remove, often a genuine diagonal-only pinch point in a narrow tunnel.`)
  }

  if (report.portalsUnpaired > 0) {
    lines.push('')
    lines.push(`WARNING: ${report.portalsUnpaired} portal${report.portalsUnpaired !== 1 ? 's were' : ' was'} placed with no same-color partner to link to — likely inert in-game.`)
  }
  if (report.accessibilityStillUnreachable > 0) {
    lines.push('')
    lines.push(`WARNING: ${report.accessibilityStillUnreachable} item/resource/interactable${report.accessibilityStillUnreachable !== 1 ? 's' : ''} could not be made reachable automatically — often because the source map guarded them with water, rock, or a gate/quest mechanic this importer doesn't yet emit. Worth checking manually with the Map Grid's blocked-tile overlay.`)
  }
  if (report.unboundOrphanOwners.length > 0) {
    lines.push('')
    lines.push(`WARNING: ${report.unboundOrphanOwners.length} player${report.unboundOrphanOwners.length !== 1 ? 's' : ''} had no town to bind to a start — they have no start point on the converted map.`)
  }
  if (report.outOfEnvelopeCount > 0) {
    lines.push('')
    lines.push(`WARNING: ${report.outOfEnvelopeCount} object${report.outOfEnvelopeCount !== 1 ? 's' : ''} sat outside the source map's own bounds and were skipped.`)
  }
  if (result.validationErrors.length > 0) {
    lines.push('')
    lines.push(`${result.validationErrors.length} structural validation issue${result.validationErrors.length !== 1 ? 's' : ''} found in the converted map:`)
    for (const e of result.validationErrors) lines.push(`  - ${e}`)
  }

  if (variants.length > 0) {
    lines.push('')
    lines.push(`Scenery variety (${variants.length} kind${variants.length !== 1 ? 's' : ''}):`)
    for (const [sid, count] of variants) lines.push(`  ${sid}: ${count}`)
  }
  if (omitted.length > 0) {
    lines.push('')
    lines.push(`Not converted (${totalOmitted} object${totalOmitted !== 1 ? 's' : ''}, ${omitted.length} reason${omitted.length !== 1 ? 's' : ''}):`)
    for (const [reason, count] of omitted) lines.push(`  ${describeOmitReason(reason)}: ${count}`)
  }
  if (sourceObjects.length > 0) {
    lines.push('')
    lines.push(`Source objects (${sourceObjects.length} kind${sourceObjects.length !== 1 ? 's' : ''} found in the H3 map):`)
    for (const [name, count] of sourceObjects) lines.push(`  ${name}: ${count}`)
  }

  // Full per-instance detail — every distinct group of (h3Id, subId, .def
  // name, outcome), file-only (not shown on screen): the whole reason this
  // report exists as its own downloadable file rather than just the on-
  // screen summary above. See H3ImportReport.detailRows's own doc comment
  // for why outcome is part of the group key (the same h3Id/subId/defName
  // can resolve differently depending on placement biome).
  if (report.detailRows.length > 0) {
    lines.push('')
    lines.push('='.repeat(70))
    lines.push(`Full object detail (${report.detailRows.length} distinct group${report.detailRows.length !== 1 ? 's' : ''}, one line per H3 id + subId + .def name + outcome):`)
    lines.push('')
    for (const row of report.detailRows) {
      const source = `H3 id ${row.h3Id}, subId ${row.subId}, "${row.h3Name}", def "${row.defName}"`
      const outcome = row.mappedSid
        ? `-> OE "${row.mappedSid}"${row.mappedName ? ` ("${row.mappedName}")` : ''} [${row.note}]`
        : `-> SKIPPED [${row.note}]`
      lines.push(`  x${row.count}  ${source}  ${outcome}`)
    }
  }

  return lines.join('\n') + '\n'
}

/** `<map-name>-import-report.txt`, stripping the extension the importer
 *  already appended (`result.name` is always "<stem>.map"). */
function reportFileName(result: ImportH3mResult): string {
  return `${result.name.replace(/\.map$/i, '')}-import-report.txt`
}

/** RFC 4180: only quote a field when it needs it, doubling any internal
 *  quote — most fields here (ids, sids) never need quoting, only h3Name/
 *  defName/note occasionally contain a comma. */
function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** `report.detailRows` as CSV — the same data as buildReportText()'s "Full
 *  object detail" section, but importable into SQLite/DuckDB/Postgres/
 *  Excel for real querying rather than only grep/eyeballing a text file. */
function buildDetailCsv(result: ImportH3mResult): string {
  const header = ['h3Id', 'subId', 'h3Name', 'defName', 'count', 'mappedSid', 'mappedName', 'note']
  const lines = [header.join(',')]
  for (const row of result.report.detailRows) {
    lines.push([
      row.h3Id, row.subId, csvField(row.h3Name), csvField(row.defName), row.count,
      row.mappedSid ?? '', row.mappedName ? csvField(row.mappedName) : '', csvField(row.note),
    ].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** `<map-name>-import-detail.csv`. */
function detailCsvFileName(result: ImportH3mResult): string {
  return `${result.name.replace(/\.map$/i, '')}-import-detail.csv`
}

export default function ImportH3mDialog({ open, onOpenChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)

  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ImportH3mResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Skip the intro/credits screen straight to the file picker when the user
  // previously checked "Don't show this again" — but only once Game Data is
  // loaded, since the intro screen is also where the "Load Game Data first"
  // alert lives; without a catalog, showing that alert is more useful than
  // auto-triggering an import that will immediately fail.
  useEffect(() => {
    if (!open || phase !== 'idle' || !catalog) return
    if (localStorage.getItem(INTRO_SHOWN_KEY) === '1') void handleImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, catalog])

  const handleImport = async () => {
    if (dontShowAgain) localStorage.setItem(INTRO_SHOWN_KEY, '1')
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
    if (dontShowAgain) localStorage.setItem(INTRO_SHOWN_KEY, '1')
    setPhase('idle')
    setResult(null)
    setErrorMsg('')
    onOpenChange(false)
  }

  const report = result?.report ?? null
  const omitted = report ? sortedCounts(report.omittedReasonCounts) : []
  const variants = report ? sortedCounts(report.sceneryVariantCounts) : []
  const sourceObjects = report ? sortedCounts(report.sourceObjectCounts) : []
  const totalOmitted = omitted.reduce((sum, [, count]) => sum + count, 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Heroes of Might & Magic III Map</DialogTitle>
        </DialogHeader>

        {/* ── Idle ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Convert a Heroes of Might and Magic III (.h3m) map into a new Olden Era map:
              terrain, decoration (with randomized visual variety), towns, monsters,
              resources, and — where the source map's win condition is supported —
              a working victory quest. The result opens as a new, unsaved map here in TSE;
              save it wherever you like afterward.
            </p>
            <hr />
            <p className="text-sm text-muted-foreground">
              <span>Credit goes to </span>
              <a className="text-foreground hover:underline" target="_blank" href="https://github.com/leviritchie">Levi Ritchie</a>
              <span> for his work on the </span>
              <a className="text-foreground hover:underline" target="_blank" href="https://github.com/leviritchie/homm3-olden-stock-translator">homm3-olden-stock-translator</a>
              <span> which has been a great reference and inspiration for this tool.</span>
            </p>
            <p className="text-center">Thank you! 🙏</p>
            <hr />

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
              <div>River tiles</div>
              <div className="text-foreground">{report.riverTilesConverted}</div>
              <div>Victory quest</div>
              <div className="text-foreground">{report.hasVictoryQuest ? 'Yes (defeat all enemies)' : 'None (unsupported win condition)'}</div>
              <div>Portals linked</div>
              <div className="text-foreground">{report.portalsLinked}</div>
              <div>Accessibility fixes</div>
              <div className="text-foreground">{report.accessibilityDecorRemoved} removed, {report.accessibilityTargetsNudged} nudged</div>
              <div>Ground-truth floor fixes</div>
              <div className="text-foreground">{report.groundTruthDecorRemoved} removed</div>
            </div>

            {report.portalsUnpaired > 0 && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {report.portalsUnpaired} portal{report.portalsUnpaired !== 1 ? 's were' : ' was'} placed with no same-color partner to link to —
                  {' '}likely inert in-game.
                </AlertDescription>
              </Alert>
            )}

            {report.accessibilityStillUnreachable > 0 && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {report.accessibilityStillUnreachable} item/resource/interactable{report.accessibilityStillUnreachable !== 1 ? 's' : ''} could not
                  be made reachable automatically — often because the source map guarded them with water, rock, or a gate/quest
                  mechanic this importer doesn't yet emit. Worth checking manually with the Map Grid's blocked-tile overlay.
                </AlertDescription>
              </Alert>
            )}

            {report.groundTruthStillBlocked > 0 && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {report.groundTruthStillBlocked} tile{report.groundTruthStillBlocked !== 1 ? 's' : ''} the source map's own data says
                  {' '}should be walkable floor {report.groundTruthStillBlocked !== 1 ? 'remain' : 'remains'} unreachable — no decorative
                  {' '}object was found nearby to safely remove, often a genuine diagonal-only pinch point in a narrow tunnel.
                </AlertDescription>
              </Alert>
            )}

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
                      <span className="text-foreground truncate">{describeOmitReason(reason)}</span>
                      <span className="text-muted-foreground shrink-0">{count}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {sourceObjects.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Source objects ({sourceObjects.length} kind{sourceObjects.length !== 1 ? 's' : ''} found in the H3 map)
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {sourceObjects.map(([name, count]) => (
                    <li key={name} className="flex justify-between gap-2">
                      <span className="text-foreground truncate">{name}</span>
                      <span className="text-muted-foreground shrink-0">{count}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {(phase === 'idle' || phase === 'error') && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="import-h3m-dont-show"
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(!!v)}
              />
              <Label htmlFor="import-h3m-dont-show" className="text-xs text-muted-foreground cursor-pointer">
                Don't show this again
              </Label>
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
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
            {phase === 'done' && result && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    void saveFile(
                      buildDetailCsv(result),
                      detailCsvFileName(result),
                      { name: 'CSV', extensions: ['csv'] },
                      'text/csv',
                    )
                  }}
                >
                  Save detail (CSV)…
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void saveFile(
                      buildReportText(result),
                      reportFileName(result),
                      { name: 'Text', extensions: ['txt'] },
                      'text/plain',
                    )
                  }}
                >
                  Save report…
                </Button>
                <Button onClick={handleClose}>Close</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
