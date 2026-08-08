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
//
// issue #133: redesigned for more user control. The old version hid the SID
// entirely and silently regenerated a brand-new one from the typed text on
// every single save — editing an existing name's text would orphan its old
// localization token forever and repoint the file at a fresh one. Now both
// the naming SID and its text are shown and independently editable, and an
// opt-in checkbox controls whether this dialog manages a localization token
// at all (unchecked writes the SID field's raw value straight into the file,
// same as the original pre-#125 behavior — now a deliberate choice instead
// of an accident). The old "legacy value" warning (`.endsWith('_sid')`,
// which false-fired on any auto-generated SID with a collision suffix like
// `_name_sid_2`) is gone, replaced by a plain first-time note gated on
// genuine first-time state (no prior nameTitle/customCityName at all).

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
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
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
  /** Every known entity SID and localization SID — used to avoid a generated
   *  or manually-typed SID colliding with anything else. */
  existingSids: string[]
}

export default function SetDisplayNameDialog({
  open,
  onOpenChange,
  entity,
  mapFilePath,
  existingSids,
}: SetDisplayNameDialogProps) {
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)

  const [sidValue, setSidValue] = useState('')
  const [textValue, setTextValue] = useState('')
  // Tracks whether the user has directly typed into the SID field — while
  // false, the SID field auto-follows the text field (slug-follows-title,
  // same pattern as a URL slug field), so the user sees a live suggestion
  // without it silently overwriting a SID they've already customized.
  const [sidTouched, setSidTouched] = useState(false)
  const [autoManageLoc, setAutoManageLoc] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && entity) {
      const currentSid = entity.displayName ?? ''
      setSidValue(currentSid)
      setTextValue(currentSid ? (localization[currentSid] ?? '') : '')
      // An existing SID is never auto-reflowed; only a genuinely blank,
      // first-time field starts in "follow the text" mode.
      setSidTouched(!!currentSid)
      // Default matches what's already true of the current value: no prior
      // value, or a prior value already backed by a real token, means this
      // dialog should keep managing it. A prior value with NO token (raw
      // literal text, e.g. written before issue #132's fix, or previously
      // saved with this box unchecked) stays unmanaged until the user opts
      // back in — reopening the dialog must never silently upgrade it.
      setAutoManageLoc(!currentSid || currentSid in localization)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity])

  if (!entity) return null

  const previousSid = entity.displayName ?? ''
  const isFirstTime = !previousSid
  const trimmedSid = sidValue.trim()
  const trimmedText = textValue.trim()

  const handleTextChange = (text: string) => {
    setTextValue(text)
    if (!sidTouched && autoManageLoc) {
      // Exclude this entity's own current SID from the collision set — an
      // unedited name shouldn't get bumped to a "_2" suffix against itself.
      const collisionSids = existingSids.filter((s) => s !== previousSid)
      setSidValue(generateDisplayNameSid(text, collisionSids))
    }
  }

  const handleSidChange = (v: string) => {
    setSidValue(v)
    setSidTouched(true)
  }

  const handleAutoManageChange = (checked: boolean) => {
    setAutoManageLoc(checked)
    if (checked && !textValue.trim()) {
      setTextValue(localization[sidValue] ?? '')
    }
  }

  const isDuplicateSid =
    trimmedSid !== previousSid && trimmedSid !== '' && existingSids.includes(trimmedSid)

  const currentText = previousSid ? (localization[previousSid] ?? '') : ''
  const isUnchanged = autoManageLoc
    ? trimmedSid === previousSid && trimmedText === currentText
    : trimmedSid === previousSid

  const isEmpty = trimmedSid === ''
  const canSave = !isEmpty && !isUnchanged && !isDuplicateSid && !!mapFilePath

  const handleSave = async () => {
    if (!mapFilePath || !canSave) return
    setSaving(true)
    setError(null)
    try {
      const entityType = Number(entity.type)
      if (!Number.isFinite(entityType)) {
        throw new Error(`Entity has a non-numeric type ("${entity.type}") — cannot target it in propsName`)
      }
      if (entity.isCitySpawner) {
        await saveMapFile(mapFilePath, {
          kind: 'setCityName',
          entityType,
          entityId: entity.id,
          customCityName: trimmedSid,
        })
      } else {
        await saveMapFile(mapFilePath, {
          kind: 'setDisplayName',
          entityType,
          entityId: entity.id,
          nameTitle: trimmedSid,
        })
      }
      if (autoManageLoc) {
        if (previousSid && previousSid !== trimmedSid) {
          renameLocalizationToken(previousSid, trimmedSid, trimmedText)
        } else {
          setLocalizationToken(trimmedSid, trimmedText)
        }
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const nameLabel = entity.isCitySpawner ? 'City name' : 'Display name'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entity.isCitySpawner ? 'Set city name' : 'Set display name'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="set-display-name-auto-loc"
              checked={autoManageLoc}
              onCheckedChange={(c) => handleAutoManageChange(c === true)}
            />
            <Label htmlFor="set-display-name-auto-loc" className="cursor-pointer text-sm">
              Automatically manage this SID's localization text
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-display-name-sid">
              {autoManageLoc ? 'Naming SID' : `${nameLabel} (written directly, no localization)`} for{' '}
              <span className="font-mono">{entity.sid}</span>
            </Label>
            <Input
              id="set-display-name-sid"
              value={sidValue}
              onChange={(e) => handleSidChange(e.target.value)}
              className="font-mono"
              autoFocus
            />
          </div>

          {autoManageLoc && (
            <div className="space-y-1.5">
              <Label htmlFor="set-display-name-text">{nameLabel} text</Label>
              <Input
                id="set-display-name-text"
                value={textValue}
                onChange={(e) => handleTextChange(e.target.value)}
              />
            </div>
          )}

          {isFirstTime && autoManageLoc && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              A localization token will be created automatically using the SID above.
            </p>
          )}

          {isDuplicateSid && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                "{trimmedSid}" is already used by another entity or token.
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
