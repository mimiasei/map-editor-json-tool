// ─── Set a custom display name on a map object and write it to the .map file ─
// Desktop-only test feature — see issue #120. Targets objectsProperties.propsName
// (nameTitle), scoped for now to objects that already have an entity SID —
// this editor's job is scripting, not full map authoring, so it only reaches
// objects it already surfaces elsewhere (the Entity SIDs sidebar).
//
// issue #125 item 6: the game always treats nameTitle as a localization SID
// lookup, never literal text — writing the typed text straight into it (the
// original behavior) rendered in-game as "LOC:<text>" whenever no matching
// token existed, which was always, since nothing ever registered one. Fixed
// by generating a real SID from the text (see slugify.ts) and registering
// the text as that SID's English localization token instead.
//
// issue #132: a city spawner's name doesn't live in propsName at all — the
// game reads objectsProperties.propCities.customCityName instead, which
// follows the exact same "always a SID, never literal text" rule. entity.isCitySpawner
// (set by the caller) routes the write to the right table transparently —
// this dialog's UI and SID-generation logic are otherwise identical either way.

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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { MapEntity } from '@/types/map-context'
import { saveMapFile } from '@/lib/map-save'
import { generateDisplayNameSid } from '@/lib/slugify'
import { useScenarioStore } from '@/store/useScenarioStore'

interface SetDisplayNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entity whose object gets the display name. Dialog renders nothing when null. */
  entity: MapEntity | null
  mapFilePath: string | null
  /** Every known entity SID and localization SID — used both to avoid a
   *  generated SID colliding with anything, and to detect a legacy literal
   *  value (see isLegacyValue below). */
  existingSids: string[]
}

export default function SetDisplayNameDialog({
  open,
  onOpenChange,
  entity,
  mapFilePath,
  existingSids,
}: SetDisplayNameDialogProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && entity) {
      setValue(entity.displayName ?? '')
      setError(null)
    }
  }, [open, entity])

  if (!entity) return null

  const trimmed = value.trim()
  const isUnchanged = trimmed === (entity.displayName ?? '')
  const isEmpty = trimmed === ''
  // A pre-existing value that isn't one of this editor's own generated SIDs —
  // i.e. literal text written before this fix existed, still rendering as
  // "LOC:<text>" in-game. Saving (with an actual edit) replaces it with a
  // proper SID+token pair.
  const isLegacyValue = !!entity.displayName && !entity.displayName.endsWith('_sid')
  const canSave = !isEmpty && !isUnchanged && !!mapFilePath

  const handleSave = async () => {
    if (!mapFilePath || !canSave) return
    setSaving(true)
    setError(null)
    try {
      const entityType = Number(entity.type)
      if (!Number.isFinite(entityType)) {
        throw new Error(`Entity has a non-numeric type ("${entity.type}") — cannot target it in propsName`)
      }
      const sid = generateDisplayNameSid(trimmed, existingSids)
      if (entity.isCitySpawner) {
        await saveMapFile(mapFilePath, {
          kind: 'setCityName',
          entityType,
          entityId: entity.id,
          customCityName: sid,
        })
      } else {
        await saveMapFile(mapFilePath, {
          kind: 'setDisplayName',
          entityType,
          entityId: entity.id,
          nameTitle: sid,
        })
      }
      useScenarioStore.getState().setLocalizationToken(sid, trimmed)
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
          <DialogTitle>{entity.isCitySpawner ? 'Set city name' : 'Set display name'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-display-name">
              {entity.isCitySpawner ? 'City name' : 'Display name'} for{' '}
              <span className="font-mono">{entity.sid}</span>
            </Label>
            <Input
              id="set-display-name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>

          {isLegacyValue && (
            <Alert className="border-yellow-600/50 bg-yellow-50 dark:bg-yellow-950/30">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
              <AlertDescription className="ml-2">
                The current value (<span className="font-mono">{entity.displayName}</span>) is literal
                text written before this was fixed — the game shows it in-game as{' '}
                <span className="font-mono">LOC:{entity.displayName}</span>. Saving generates a real
                localization SID and registers this text as its translation, fixing it.
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
