// ─── Rename an entity SID and write it back to the .map file ────────────────
// Desktop-only test feature — see issue #120. Deliberately does not rewrite
// trigger/interruption references to the old SID: it warns and requires
// explicit confirmation instead, keeping the write itself surgical (one
// string, one table) so a failed in-game load is attributable to the rename
// or to the .map format's still-unverified hashSum, never to a second,
// unrelated edit happening at the same time.

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { MapEntity } from '@/types/map-context'
import { saveMapFile } from '@/lib/map-save'

interface RenameEntitySidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entity being renamed. Dialog renders nothing when null. */
  entity: MapEntity | null
  /** Every other known entity SID, for uniqueness validation. */
  existingSids: string[]
  /** Human-readable "trigger [0, 1, 2]"-style descriptions of every place entity.sid is referenced. */
  usageDescriptions: string[]
  mapFilePath: string | null
}

export default function RenameEntitySidDialog({
  open,
  onOpenChange,
  entity,
  existingSids,
  usageDescriptions,
  mapFilePath,
}: RenameEntitySidDialogProps) {
  const [value, setValue] = useState('')
  const [confirmedReferenced, setConfirmedReferenced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state each time a new entity is targeted.
  useEffect(() => {
    if (open && entity) {
      setValue(entity.sid)
      setConfirmedReferenced(false)
      setError(null)
    }
  }, [open, entity])

  if (!entity) return null

  const trimmed = value.trim()
  const isUnchanged = trimmed === entity.sid
  const isEmpty = trimmed === ''
  const isDuplicate = !isUnchanged && !isEmpty && existingSids.includes(trimmed)
  const hasUsages = usageDescriptions.length > 0
  const canSave = !isEmpty && !isDuplicate && !isUnchanged && !!mapFilePath && (!hasUsages || confirmedReferenced)

  const handleSave = async () => {
    if (!mapFilePath || !canSave) return
    setSaving(true)
    setError(null)
    try {
      await saveMapFile(mapFilePath, { kind: 'renameSid', oldSid: entity.sid, newSid: trimmed })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename entity SID</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rename-entity-sid">New SID</Label>
            <Input
              id="rename-entity-sid"
              value={value}
              onChange={(e) => { setValue(e.target.value); setConfirmedReferenced(false) }}
              className="font-mono text-sm"
              autoFocus
            />
            {isDuplicate && (
              <p className="text-xs text-destructive">Another entity already uses this SID.</p>
            )}
          </div>

          {hasUsages && (
            <Alert className="border-yellow-600/50 bg-yellow-50 dark:bg-yellow-950/30">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
              <AlertDescription className="ml-2 space-y-1.5">
                <p>
                  <span className="font-mono">{entity.sid}</span> is referenced by{' '}
                  {usageDescriptions.length} {usageDescriptions.length === 1 ? 'place' : 'places'}.
                  Renaming does <strong>not</strong> update these — they will keep pointing at the old SID:
                </p>
                <ul className="list-disc pl-4 font-mono text-xs">
                  {usageDescriptions.map((u) => <li key={u}>{u}</li>)}
                </ul>
                <label className="flex items-center gap-1.5 pt-1 font-normal text-foreground">
                  <Checkbox checked={confirmedReferenced} onCheckedChange={(c) => setConfirmedReferenced(c === true)} />
                  Rename anyway
                </label>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            Writes directly to the loaded <code>.map</code> file. A one-time backup
            is kept at <code>.map.bak</code> next to it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save to .map
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
