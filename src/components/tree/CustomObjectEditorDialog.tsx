// ─── Custom map object authoring dialog (issue #146) ──────────────────────────
// Clones a real object template (Core/DB/map/objects/*.json) plus its matching
// behavior logic (Core/DB/objects_logic/**/*.json) under a brand-new object id,
// so it gets its own real in-game name/description/narrativeDescription — the
// mechanism the user discovered and verified in-game (a real object type,
// not a per-instance propsName override, which is confirmed non-functional —
// see plans/PLAN-issue-145-object-naming-feasibility.md). Same "clone a real
// definition, edit identity fields, mint a new id, ship it" pattern as
// HeroEditorDialog (issue #141), much smaller: only id/name/description/
// narrativeDescription are exposed, everything else (tag, isInteractable,
// prefs, geometry, generatorConfig, and the whole objects_logic entry save
// its own id) is cloned verbatim — see the issue #146 plan's field-scope
// section for why.
//
// Unlike HeroEditorDialog, there is no placed instance driving this dialog —
// a custom object is authored standalone, before it exists anywhere on the
// map. This app never writes a new objects[] entry (out of scope, see the
// plan), so saving only ever touches the customMapObjects store slice —
// there is no saveMapFile/.map-file write here at all. Placing the new
// object type on the map happens in the official Unfrozen map editor, which
// already picks up newly-shipped custom object types once this app's ZIP
// export ships them (zip-export.ts).
//
// The base object, once picked, is fixed for the life of this dialog session
// (mirrors HeroEditorDialog, where the base hero is fixed by the entity) —
// "Change base" clears it and re-seeds from a fresh pick, rather than trying
// to reconcile edited fields against a different source's shape.

import { useState } from 'react'
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
import EntityCombobox from '@/components/common/EntityCombobox'
import { ENTITY_REGISTRIES } from '@/schema/entities'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useLocalizedTextField } from '@/hooks/useLocalizedTextField'
import LocalizedTextField from '@/components/common/LocalizedTextField'
import FieldInfo from '@/components/common/FieldInfo'
import { mintCustomSid } from '@/lib/zip-export'
import { isMapObjectIdTaken } from '@/lib/custom-map-object-authoring'

interface CustomObjectEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing custom object id to edit, or null to author a new one. */
  editingId: string | null
  existingSids: string[]
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export default function CustomObjectEditorDialog({
  open,
  onOpenChange,
  editingId,
  existingSids,
}: CustomObjectEditorDialogProps) {
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const removeLocalizationToken = useScenarioStore((s) => s.removeLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)
  const customMapObjects = useScenarioStore((s) => s.customMapObjects)
  const setCustomMapObject = useScenarioStore((s) => s.setCustomMapObject)
  const removeCustomMapObject = useScenarioStore((s) => s.removeCustomMapObject)
  const mapName = useScenarioStore((s) => s.mapName)
  const catalog = useCatalogStore((s) => s.catalog)

  const existingDefinition = editingId ? customMapObjects[editingId] : undefined

  const [sourceObjectId, setSourceObjectId] = useState('')
  const [sourcePickerValue, setSourcePickerValue] = useState('')
  const [id, setId] = useState('')
  const [initialized, setInitialized] = useState(false)
  // Tracks whether this open has already pulled sourceObjectId from
  // existingDefinition once — without it, "Change base" (which clears
  // sourceObjectId back to '') would immediately get re-synced right back to
  // the original source on the next render while still editing the same
  // customMapObjects entry.
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseCatalogObject = catalog?.mapObjects.find((o) => o.id === sourceObjectId)
  const baseCatalogLogic = catalog?.objectLogics.find((l) => l.id === sourceObjectId)

  const templateBase: Record<string, unknown> | null =
    existingDefinition?.template ?? baseCatalogObject?.raw ?? null
  const logicBase: Record<string, unknown> | undefined =
    existingDefinition?.logic ?? baseCatalogLogic?.raw
  const logicSourcePathBase: string | undefined =
    existingDefinition?.logicSourcePath ?? baseCatalogLogic?.sourcePath
  const baseDisplayName = catalog?.mapObjects.find((o) => o.id === sourceObjectId)?.name ?? sourceObjectId
  const catalogMissing = !!sourceObjectId && !templateBase

  const previousNameSid = str(templateBase?.name)
  const previousDescSid = str(templateBase?.description)
  const previousNarrativeSid = str(templateBase?.narrativeDescription)

  const nameField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousNameSid),
  })
  const descField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousDescSid),
    suffix: 'desc_sid',
    optional: true,
  })
  const narrativeField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousNarrativeSid),
    suffix: 'narrative_sid',
    optional: true,
  })

  // Seed once per pick — whenever a base object's raw template becomes
  // available (dialog opened on an already-customized object, or the user
  // just picked one to clone from) and hasn't been seeded yet this session.
  if (open && templateBase && !initialized) {
    nameField.reset(previousNameSid, previousNameSid ? (localization[previousNameSid] ?? '') : '')
    descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
    narrativeField.reset(previousNarrativeSid, previousNarrativeSid ? (localization[previousNarrativeSid] ?? '') : '')
    setId(
      existingDefinition?.id ??
        mintCustomSid(mapName, 'object', [
          ...Object.keys(customMapObjects),
          ...(catalog?.mapObjects.map((o) => o.id) ?? []),
        ]),
    )
    setError(null)
    setInitialized(true)
  }

  // Pull the source object id from an existing definition once per open —
  // guarded by `synced` (not sourceObjectId) so "Change base" sticks instead
  // of snapping back to the original source on the next render.
  if (open && existingDefinition && !synced) {
    setSourceObjectId(existingDefinition.sourceObjectId)
    setSourcePickerValue(existingDefinition.sourceObjectId)
    setSynced(true)
  }
  if (!open && (initialized || sourceObjectId || synced)) {
    setInitialized(false)
    setSourceObjectId('')
    setSourcePickerValue('')
    setSynced(false)
  }

  const handleChangeBase = () => {
    setSourceObjectId('')
    setSourcePickerValue('')
    setInitialized(false)
  }

  const handlePickSource = (value: string) => {
    setSourcePickerValue(value)
    // Only lock in a pick that actually resolves to a real object id — free
    // text the combobox always accepts on every keystroke otherwise "locks
    // in" (and hides the picker) after the very first character typed.
    // EntityCombobox itself falls back to the bundled static registry when
    // no Core.zip is loaded (a different, smaller id list than
    // catalog.mapObjects), so check whichever one it's actually offering —
    // not just catalog.mapObjects, or a pick made from the fallback list
    // would silently never lock in at all. The static registry carries no
    // raw JSON to clone from either way; picking from it still correctly
    // falls through to the "Load the Core.zip catalog…" message below via
    // catalogMissing, same as the hero editor's equivalent case.
    const knownIds = catalog
      ? catalog.mapObjects.map((o) => o.id)
      : ENTITY_REGISTRIES.mapObject.map((o) => o.id)
    if (knownIds.includes(value)) {
      setSourceObjectId(value)
    }
  }

  const trimmedId = id.trim()
  const idTaken =
    trimmedId !== (existingDefinition?.id ?? '') && isMapObjectIdTaken(trimmedId, catalog, customMapObjects)

  const canSave =
    !!sourceObjectId &&
    !catalogMissing &&
    trimmedId !== '' &&
    !idTaken &&
    nameField.trimmedSid !== ''

  const manageToken = (previous: string, next: string, text: string) => {
    if (!next) {
      if (previous) removeLocalizationToken(previous)
      return
    }
    if (previous && previous !== next) {
      renameLocalizationToken(previous, next, text)
    } else {
      setLocalizationToken(next, text)
    }
  }

  const handleSave = () => {
    if (!canSave || !templateBase) return
    setSaving(true)
    setError(null)
    try {
      const template: Record<string, unknown> = {
        ...templateBase,
        id: trimmedId,
        name: nameField.trimmedSid,
        description: descField.trimmedSid,
        narrativeDescription: narrativeField.trimmedSid,
      }
      const logic = logicBase ? { ...logicBase, id: trimmedId } : undefined
      const logicSourcePath = logicBase ? logicSourcePathBase : undefined

      // Renaming an already-customized object's id — drop the stale entry so
      // it doesn't linger as an orphaned, unreferenced customMapObjects key.
      if (existingDefinition && existingDefinition.id !== trimmedId) {
        removeCustomMapObject(existingDefinition.id)
      }
      setCustomMapObject(trimmedId, {
        id: trimmedId,
        sourceObjectId,
        template,
        logic,
        logicSourcePath,
      })

      manageToken(previousNameSid, nameField.trimmedSid, nameField.trimmedText)
      manageToken(previousDescSid, descField.trimmedSid, descField.trimmedText)
      manageToken(previousNarrativeSid, narrativeField.trimmedSid, narrativeField.trimmedText)

      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        // Same reasoning as HeroEditorDialog: this dialog holds a local draft
        // that only commits on "Save" — an accidental outside click shouldn't
        // silently discard it. Escape and Cancel still close normally.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{existingDefinition ? 'Edit custom map object' : 'New custom map object'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Clones a real map object's definition under a brand-new id so it can carry its own
            in-game name and description — the same "clone, edit, ship" mechanism the hero editor
            uses. This app authors and ships the definition only; place the new object type on the
            map in the official Unfrozen map editor once it recognizes the shipped ZIP.
          </p>

          {!sourceObjectId && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Base object</Label>
                <FieldInfo text="The real map object whose definition this custom object clones. Everything except id/name/description/narrative description is copied verbatim, including its 3D asset and footprint." />
              </div>
              <EntityCombobox
                value={sourcePickerValue}
                onChange={handlePickSource}
                category="mapObject"
                placeholder="Search for an object to clone…"
              />
            </div>
          )}

          {catalogMissing && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                Load the Core.zip catalog (Game Database) to look up and clone this object's base definition.
              </AlertDescription>
            </Alert>
          )}

          {templateBase && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Based on: <span className="font-medium text-foreground">{baseDisplayName}</span>
                  {existingDefinition && ' (already customized)'}
                </p>
                <button
                  type="button"
                  onClick={handleChangeBase}
                  className="shrink-0 rounded border border-transparent p-0.5 hover:border-border hover:bg-accent"
                  title="Click to change the base object"
                >
                  <CatalogIcon iconId={baseCatalogObject?.icon} name={baseDisplayName} size={24} />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="object-editor-id">Id</Label>
                  <FieldInfo text="The unique id this custom object ships under — also becomes the filename (DB/map/objects/custom_maps/{mapName}_objects.json entry, and DB/objects_logic/{family}/{id}.json if it has behavior logic). Must not match any object id already in the game." />
                </div>
                <Input
                  id="object-editor-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="font-mono"
                />
                {idTaken && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">"{trimmedId}" is already used by another object.</AlertDescription>
                  </Alert>
                )}
              </div>

              <LocalizedTextField
                idPrefix="object-editor-name"
                managedSidLabel="Naming SID"
                unmanagedLabel="Object name (written directly, no localization)"
                textLabel="Object name text"
                sidValue={nameField.sidValue}
                textValue={nameField.textValue}
                autoManageLoc
                onSidChange={nameField.handleSidChange}
                onTextChange={nameField.handleTextChange}
                isDuplicate={nameField.trimmedSid !== previousNameSid && nameField.trimmedSid !== '' && existingSids.includes(nameField.trimmedSid)}
                showFirstTimeNote={!previousNameSid}
              />
              <LocalizedTextField
                idPrefix="object-editor-desc"
                managedSidLabel="Description SID"
                unmanagedLabel="Description (written directly, no localization)"
                textLabel="Description text"
                sidValue={descField.sidValue}
                textValue={descField.textValue}
                autoManageLoc
                onSidChange={descField.handleSidChange}
                onTextChange={descField.handleTextChange}
                isDuplicate={descField.trimmedSid !== previousDescSid && descField.trimmedSid !== '' && existingSids.includes(descField.trimmedSid)}
                optional
                bordered
              />
              <LocalizedTextField
                idPrefix="object-editor-narrative"
                managedSidLabel="Narrative description SID"
                unmanagedLabel="Narrative description (written directly, no localization)"
                textLabel="Narrative description text"
                sidValue={narrativeField.sidValue}
                textValue={narrativeField.textValue}
                autoManageLoc
                onSidChange={narrativeField.handleSidChange}
                onTextChange={narrativeField.handleTextChange}
                isDuplicate={narrativeField.trimmedSid !== previousNarrativeSid && narrativeField.trimmedSid !== '' && existingSids.includes(narrativeField.trimmedSid)}
                optional
                bordered
              />

              {!logicBase && (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  This base object has no behavior logic entry — the clone will ship as a template
                  only, same as it.
                </p>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
