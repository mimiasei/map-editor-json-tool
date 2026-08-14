// ─── Custom artifact authoring dialog (issue #150) ────────────────────────────
// Clones a real artifact/item template (Core/DB/items/items/*.json) under a
// brand-new artifact id, so it gets its own real in-game name/description/
// narrativeDescription/icon — the same "clone a real definition, edit
// identity, mint a new id, ship it" pattern already used for custom map
// objects/heroes/units. Unlike those precedents, every real artifact already
// carries a real icon id (units have none at all; map objects' icon isn't
// user-facing the same way) — so this is the first custom-entity dialog that
// also lets the icon be picked from a visual browser rather than only
// inherited from the base.
//
// Ground placement: if the source artifact has a matching
// Core/DB/map/objects/6_artifacts.json entry (already collected into
// catalog.mapObjects under category 'artifacts' — no separate catalog work
// needed), that entry's own 3D prefab/geometry is cloned verbatim (only `id`
// repointed) so the custom artifact becomes placeable in the official
// Unfrozen map editor too. Magic scroll items have no such entry (they're
// only ever obtained via a scroll-box reward roll) — those clones simply
// ship without one, same as any other optional field.
//
// Scope, mirroring CustomObjectEditorDialog exactly: only id/name/
// description/narrativeDescription/icon are editable. `bonuses` (the
// mechanical effect array) varies too wildly in shape across items for a
// generic editor and nobody has asked for it — cloned verbatim, same as
// slot_/rarity/goodsValue/etc.

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
import IconBrowserDialog from '@/components/common/IconBrowserDialog'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useLocalizedTextField } from '@/hooks/useLocalizedTextField'
import LocalizedTextField from '@/components/common/LocalizedTextField'
import FieldInfo from '@/components/common/FieldInfo'
import { mintCustomSid } from '@/lib/zip-export'
import { isArtifactIdTaken } from '@/lib/custom-artifact-authoring'

interface CustomArtifactEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing custom artifact id to edit, or null to author a new one. */
  editingId: string | null
  existingSids: string[]
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

export default function CustomArtifactEditorDialog({
  open,
  onOpenChange,
  editingId,
  existingSids,
}: CustomArtifactEditorDialogProps) {
  const localization = useScenarioStore((s) => s.localization)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)
  const removeLocalizationToken = useScenarioStore((s) => s.removeLocalizationToken)
  const renameLocalizationToken = useScenarioStore((s) => s.renameLocalizationToken)
  const customArtifacts = useScenarioStore((s) => s.customArtifacts)
  const setCustomArtifact = useScenarioStore((s) => s.setCustomArtifact)
  const removeCustomArtifact = useScenarioStore((s) => s.removeCustomArtifact)
  const mapName = useScenarioStore((s) => s.mapName)
  const catalog = useCatalogStore((s) => s.catalog)

  const existingDefinition = editingId ? customArtifacts[editingId] : undefined

  const [sourceArtifactId, setSourceArtifactId] = useState('')
  const [sourcePickerValue, setSourcePickerValue] = useState('')
  const [id, setId] = useState('')
  const [icon, setIcon] = useState('')
  const [initialized, setInitialized] = useState(false)
  // Same reasoning as CustomObjectEditorDialog: tracks whether this open has
  // already pulled sourceArtifactId from existingDefinition once — without
  // it, "Change base" would immediately get re-synced right back.
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iconBrowserOpen, setIconBrowserOpen] = useState(false)

  const baseCatalogArtifact = catalog?.artifacts.find((a) => a.id === sourceArtifactId)
  const baseMapObject = catalog?.mapObjects.find((o) => o.category === 'artifacts' && o.id === sourceArtifactId)

  const templateBase: Record<string, unknown> | null =
    existingDefinition?.template ?? baseCatalogArtifact?.raw ?? null
  const mapObjectTemplateBase: Record<string, unknown> | undefined =
    existingDefinition?.mapObjectTemplate ?? baseMapObject?.raw
  const baseDisplayName = baseCatalogArtifact?.name ?? sourceArtifactId
  const catalogMissing = !!sourceArtifactId && !templateBase

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

  // Seed once per pick — mirrors CustomObjectEditorDialog exactly.
  if (open && templateBase && !initialized) {
    nameField.reset(previousNameSid, previousNameSid ? (localization[previousNameSid] ?? '') : '')
    descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
    narrativeField.reset(previousNarrativeSid, previousNarrativeSid ? (localization[previousNarrativeSid] ?? '') : '')
    setIcon(str(templateBase.icon, baseCatalogArtifact?.icon ?? ''))
    setId(
      existingDefinition?.id ??
        mintCustomSid(mapName, 'artifact', [
          ...Object.keys(customArtifacts),
          ...(catalog?.artifacts.map((a) => a.id) ?? []),
        ]),
    )
    setError(null)
    setInitialized(true)
  }

  if (open && existingDefinition && !synced) {
    setSourceArtifactId(existingDefinition.sourceArtifactId)
    setSourcePickerValue(existingDefinition.sourceArtifactId)
    setSynced(true)
  }
  if (!open && (initialized || sourceArtifactId || synced)) {
    setInitialized(false)
    setSourceArtifactId('')
    setSourcePickerValue('')
    setSynced(false)
  }

  const handleChangeBase = () => {
    setSourceArtifactId('')
    setSourcePickerValue('')
    setInitialized(false)
  }

  const handlePickSource = (value: string) => {
    setSourcePickerValue(value)
    // Same reasoning as CustomObjectEditorDialog's handlePickSource: only
    // lock in a pick that resolves to a real artifact id, checking whichever
    // list EntityCombobox is actually offering (catalog vs. static fallback).
    const knownIds = catalog
      ? catalog.artifacts.map((a) => a.id)
      : ENTITY_REGISTRIES.artifact.map((a) => a.id)
    if (knownIds.includes(value)) {
      setSourceArtifactId(value)
    }
  }

  const trimmedId = id.trim()
  const idTaken =
    trimmedId !== (existingDefinition?.id ?? '') && isArtifactIdTaken(trimmedId, catalog, customArtifacts)

  const canSave =
    !!sourceArtifactId &&
    !catalogMissing &&
    trimmedId !== '' &&
    !idTaken &&
    nameField.trimmedSid !== '' &&
    !!icon

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
        icon,
      }
      const mapObjectTemplate = mapObjectTemplateBase
        ? { ...mapObjectTemplateBase, id: trimmedId }
        : undefined

      // Renaming an already-customized artifact's id — drop the stale entry
      // so it doesn't linger as an orphaned, unreferenced customArtifacts key.
      if (existingDefinition && existingDefinition.id !== trimmedId) {
        removeCustomArtifact(existingDefinition.id)
      }
      setCustomArtifact(trimmedId, {
        id: trimmedId,
        sourceArtifactId,
        template,
        mapObjectTemplate,
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

  const iconBrowserOptions = (catalog?.artifacts ?? []).map((a) => ({ id: a.icon, label: a.name }))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{existingDefinition ? 'Edit custom artifact' : 'New custom artifact'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Clones a real artifact's definition under a brand-new id so it can carry its own
            in-game name, description, and icon. This app authors and ships the definition only;
            grant it via a script action (e.g. Give Item to Hero) or place it on the map in the
            official Unfrozen map editor once it recognizes the shipped ZIP.
          </p>

          {!sourceArtifactId && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Base artifact</Label>
                <FieldInfo text="The real artifact whose definition this custom artifact clones. Everything except id/name/description/narrative description/icon is copied verbatim, including its mechanical bonuses and 3D model." />
              </div>
              <EntityCombobox
                value={sourcePickerValue}
                onChange={handlePickSource}
                category="artifact"
                placeholder="Search for an artifact to clone…"
              />
            </div>
          )}

          {catalogMissing && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                Load the Core.zip catalog (Game Database) to look up and clone this artifact's base definition.
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
                  title="Click to change the base artifact"
                >
                  <CatalogIcon iconId={baseCatalogArtifact?.icon} name={baseDisplayName} size={24} />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Icon</Label>
                  <FieldInfo text="The 2D icon shown in inventory/UI. Every real artifact has one — pick any known artifact icon, or keep the base's own." />
                </div>
                <button
                  type="button"
                  onClick={() => setIconBrowserOpen(true)}
                  className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-accent/50"
                >
                  <CatalogIcon iconId={icon} name={baseDisplayName} size={32} />
                  <span className="text-xs text-muted-foreground">Click to change…</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="artifact-editor-id">Id</Label>
                  <FieldInfo text="The unique id this custom artifact ships under — also becomes the filename basis (DB/items/items/custom_maps/{mapName}_artifacts.json entry, and a matching DB/map/objects/custom_maps/{mapName}_artifact_objects.json entry if the base artifact can be placed on the ground). Must not match any artifact id already in the game." />
                </div>
                <Input
                  id="artifact-editor-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="font-mono"
                />
                {idTaken && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">"{trimmedId}" is already used by another artifact.</AlertDescription>
                  </Alert>
                )}
              </div>

              <LocalizedTextField
                idPrefix="artifact-editor-name"
                managedSidLabel="Naming SID"
                unmanagedLabel="Artifact name (written directly, no localization)"
                textLabel="Artifact name text"
                sidValue={nameField.sidValue}
                textValue={nameField.textValue}
                autoManageLoc
                onSidChange={nameField.handleSidChange}
                onTextChange={nameField.handleTextChange}
                isDuplicate={nameField.trimmedSid !== previousNameSid && nameField.trimmedSid !== '' && existingSids.includes(nameField.trimmedSid)}
                showFirstTimeNote={!previousNameSid}
              />
              <LocalizedTextField
                idPrefix="artifact-editor-desc"
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
                idPrefix="artifact-editor-narrative"
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

              {!mapObjectTemplateBase && (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  This base artifact has no ground-placement entry (e.g. a magic scroll item) — the
                  clone can still be granted via a script action, but can't be placed loose on the map.
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

      <IconBrowserDialog
        open={iconBrowserOpen}
        onOpenChange={setIconBrowserOpen}
        title="Choose an artifact icon"
        options={iconBrowserOptions}
        currentIconId={icon}
        onPick={setIcon}
      />
    </Dialog>
  )
}
