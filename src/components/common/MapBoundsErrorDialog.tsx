// ─── Out-of-bounds save block (Bug A follow-up) ─────────────────────────────
// Shown whenever useMapDocumentStore's commitToDisk finds a placed object
// whose real footprint extends past the map's edge (bounds-validation.ts) —
// this is the exact defect that crashed the actual game on load in the
// investigation this fixes (see footprint.ts's own doc comment). Mounted
// once at the app-shell level since both Save (AppShell.handleSave /
// Toolbar.handleSave) and Save As (Toolbar.handleExport) funnel into the
// same commitToDisk and need to surface the same dialog, matching
// UnsavedChangesDialog's own single-mount pattern.

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'

export default function MapBoundsErrorDialog() {
  const violations = useMapDocumentStore((s) => s.boundsViolations)
  const clearBoundsViolations = useMapDocumentStore((s) => s.clearBoundsViolations)
  const autoFixBoundsViolations = useMapDocumentStore((s) => s.autoFixBoundsViolations)
  // Last Auto-fix result, shown until the dialog closes or another attempt
  // runs — not persisted in the store since it's purely this dialog's own
  // transient feedback, not state anything else needs to react to.
  const [lastFixed, setLastFixed] = useState<number | null>(null)

  const handleAutoFix = () => {
    const { fixedCount } = autoFixBoundsViolations()
    setLastFixed(fixedCount)
  }

  const message = violations
    ? [
        "The following object(s) extend past the map's edge and can't be saved:",
        '',
        ...violations.map((v) => `• ${v.sid} (id ${v.id}) at (${v.x}, ${v.z})`),
        ...(lastFixed !== null
          ? ['', `Auto-fix moved ${lastFixed} object(s) — ${violations.length} still couldn't be placed anywhere in-bounds and reachable. Move them manually.`]
          : []),
      ].join('\n')
    : ''

  return (
    <Dialog
      open={violations !== null}
      onOpenChange={(o) => { if (!o) { clearBoundsViolations(); setLastFixed(null) } }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cannot Save — Object Out of Bounds</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 whitespace-pre-line">{message}</AlertDescription>
        </Alert>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => { clearBoundsViolations(); setLastFixed(null) }}>
            Close
          </Button>
          <Button size="sm" onClick={handleAutoFix}>Auto-fix</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
