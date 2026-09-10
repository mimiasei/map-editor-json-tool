// ─── Save-time validation block (Bug A/B follow-ups) ────────────────────────
// Shown whenever useMapDocumentStore's commitToDisk finds a save-time
// validation issue (map-validation.ts) — currently two real, confirmed-via-
// actual-game-crash defects: a placed object's footprint extending past the
// map's edge (bounds-validation.ts — the original "Bug A" investigation), or
// an object's real entrance/interaction cell fully blocked by another
// object/water/an unramped elevation wall (entrance-validation.ts — the real
// root cause behind the long-standing RMG load-freeze "Bug B" investigation,
// confirmed by the user: a single pinetree placed on a city's own entrance
// tile). Mounted once at the app-shell level since both Save
// (AppShell.handleSave / Toolbar.handleSave) and Save As (Toolbar.
// handleExport) funnel into the same commitToDisk and need to surface the
// same dialog, matching UnsavedChangesDialog's own single-mount pattern.

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import type { MapValidationIssue } from '@/lib/map-grid/map-validation'

function describeIssue(issue: MapValidationIssue): string {
  const where = `${issue.sid} (id ${issue.id}) at (${issue.x}, ${issue.z})`
  return issue.kind === 'outOfBounds'
    ? `${where} — extends past the map's edge`
    : `${where} — entrance is fully blocked (can't be reached)`
}

export default function MapValidationErrorDialog() {
  const issues = useMapDocumentStore((s) => s.mapValidationIssues)
  const clearMapValidationIssues = useMapDocumentStore((s) => s.clearMapValidationIssues)
  const autoFixMapValidationIssues = useMapDocumentStore((s) => s.autoFixMapValidationIssues)
  // Last Auto-fix result, shown until the dialog closes or another attempt
  // runs — not persisted in the store since it's purely this dialog's own
  // transient feedback, not state anything else needs to react to.
  const [lastFixed, setLastFixed] = useState<number | null>(null)

  const handleAutoFix = () => {
    const { fixedCount } = autoFixMapValidationIssues()
    setLastFixed(fixedCount)
  }

  const message = issues
    ? [
        "The following object(s) can't be saved:",
        '',
        ...issues.map((v) => `• ${describeIssue(v)}`),
        ...(lastFixed !== null
          ? ['', `Auto-fix resolved ${lastFixed} issue(s) — ${issues.length} still couldn't be fixed automatically. Fix them manually.`]
          : []),
      ].join('\n')
    : ''

  return (
    <Dialog
      open={issues !== null}
      onOpenChange={(o) => { if (!o) { clearMapValidationIssues(); setLastFixed(null) } }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cannot Save — Map Validation Failed</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 whitespace-pre-line">{message}</AlertDescription>
        </Alert>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => { clearMapValidationIssues(); setLastFixed(null) }}>
            Close
          </Button>
          <Button size="sm" onClick={handleAutoFix}>Auto-fix</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
