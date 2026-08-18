// ─── Custom artifact authoring dialog (issue #150, unified in issue #160) ────
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
// Issue #160 unified this with Custom Objects/Custom Heroes: a "Clone one
// artifact" / "Build from scratch" mode toggle (SCRATCH_ARTIFACT_BASE is the
// synthetic seed for the latter — no real artifact has blank bonuses/values,
// so there's nothing to clone from), plus item stats (slot_/rarity/
// goodsValue/costBase/costPerLevel/maxLevel/rewardForDestroy/
// upgradeDescription) and `bonuses` (mechanical effects) are now editable —
// see ArtifactBonusesEditor.tsx for the bonus-type coverage/rationale. In
// scratch mode there's no single source artifact to inherit a ground-
// placement mesh from either, so an independent, optional "Ground visual"
// picker lets the user borrow any real artifact's mesh — same "visual
// decoupled from behavior" idea Custom Map Objects' from-scratch mode uses.

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Loader2 } from 'lucide-react'
import EntityCombobox from '@/components/common/EntityCombobox'
import { ENTITY_REGISTRIES } from '@/schema/entities'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import IconBrowserDialog from '@/components/common/IconBrowserDialog'
import ArtifactBonusesEditor from '@/components/tree/ArtifactBonusesEditor'
import { RARITY_OPTIONS } from '@/components/tree/EventBankLogicEditor'
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
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback
}
function bonusArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((b) => b && typeof b === 'object') as Record<string, unknown>[]) : []
}

// Confirmed against every real Core/DB/items/items/*.json entry's `slot_` value.
const SLOT_OPTIONS = [
  'armor', 'back', 'belt', 'boots', 'head',
  'item_slot', 'left_hand', 'right_hand', 'ring', 'unic_slot',
]

// "Build from scratch" mode's seed — no real artifact has empty bonuses/zero
// values, so there's nothing genuine to clone from. Mirrors real items'
// field shape (armor.json etc.) minus id/name/description/icon, which the
// identity fields below always override anyway.
const SCRATCH_ARTIFACT_BASE: Record<string, unknown> = {
  bonuses: [],
  costBase: 0,
  costPerLevel: 0,
  goodsValue: 0,
  maxLevel: 1,
  rarity: RARITY_OPTIONS[0],
  rewardForDestroy: 0,
  slot_: SLOT_OPTIONS[0],
  upgradeDescription: '',
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

  const [mode, setMode] = useState<'clone' | 'scratch'>('clone')
  const [sourceArtifactId, setSourceArtifactId] = useState('')
  const [sourcePickerValue, setSourcePickerValue] = useState('')
  // Scratch mode only — an independent, optional pick supplying the ground-
  // placement mesh, since there's no single source artifact to inherit one
  // from (mirrors Custom Map Objects' "visual" pick in from-scratch mode).
  const [groundVisualId, setGroundVisualId] = useState('')
  const [groundVisualPickerValue, setGroundVisualPickerValue] = useState('')
  const [id, setId] = useState('')
  const [icon, setIcon] = useState('')
  const [slot, setSlot] = useState('')
  const [rarity, setRarity] = useState('')
  const [goodsValue, setGoodsValue] = useState(0)
  const [costBase, setCostBase] = useState(0)
  const [costPerLevel, setCostPerLevel] = useState(0)
  const [maxLevel, setMaxLevel] = useState(1)
  const [rewardForDestroy, setRewardForDestroy] = useState(0)
  const [bonuses, setBonuses] = useState<Record<string, unknown>[]>([])
  const [initialized, setInitialized] = useState(false)
  // Same reasoning as CustomObjectEditorDialog: tracks whether this open has
  // already pulled sourceArtifactId/mode from existingDefinition once —
  // without it, "Change base" would immediately get re-synced right back.
  const [synced, setSynced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iconBrowserOpen, setIconBrowserOpen] = useState(false)

  const baseCatalogArtifact = catalog?.artifacts.find((a) => a.id === sourceArtifactId)
  const baseMapObject = catalog?.mapObjects.find((o) => o.category === 'artifacts' && o.id === sourceArtifactId)
  const groundVisualCatalogObject = catalog?.mapObjects.find((o) => o.category === 'artifacts' && o.id === groundVisualId)

  // Absent only in a genuinely fresh pick — once a mode is chosen (clone +
  // base picked, or scratch), there's always something to seed from: either
  // a real artifact's raw definition, or SCRATCH_ARTIFACT_BASE.
  const templateBase: Record<string, unknown> | null =
    existingDefinition?.template ?? (mode === 'clone' ? baseCatalogArtifact?.raw ?? null : SCRATCH_ARTIFACT_BASE)
  const mapObjectTemplateBase: Record<string, unknown> | undefined =
    existingDefinition?.mapObjectTemplate ?? (mode === 'clone' ? baseMapObject?.raw : groundVisualCatalogObject?.raw)
  const baseDisplayName = baseCatalogArtifact?.name ?? sourceArtifactId
  const groundVisualDisplayName = catalog?.mapObjects.find((o) => o.id === groundVisualId)?.name ?? groundVisualId
  const catalogMissing = mode === 'clone' && !!sourceArtifactId && !existingDefinition && !baseCatalogArtifact
  // Once true, the full form renders — either a base/definition to seed from
  // exists, or "Build from scratch" was explicitly chosen (which needs none).
  const readyToEdit = mode === 'scratch' || !!sourceArtifactId || !!existingDefinition

  const previousNameSid = str(templateBase?.name)
  const previousDescSid = str(templateBase?.description)
  const previousNarrativeSid = str(templateBase?.narrativeDescription)
  const previousUpgradeDescSid = str(templateBase?.upgradeDescription)

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
  const upgradeDescField = useLocalizedTextField({
    autoManageLoc: true,
    existingSids: existingSids.filter((s) => s !== previousUpgradeDescSid),
    suffix: 'upgrade_desc_sid',
    optional: true,
  })

  // Seed once per pick — mirrors CustomObjectEditorDialog exactly, gated on
  // readyToEdit (not templateBase directly) so scratch mode's synthetic base
  // seeds the form immediately, same as clone mode picking a real one.
  if (open && templateBase && readyToEdit && !initialized) {
    nameField.reset(previousNameSid, previousNameSid ? (localization[previousNameSid] ?? '') : '')
    descField.reset(previousDescSid, previousDescSid ? (localization[previousDescSid] ?? '') : '')
    narrativeField.reset(previousNarrativeSid, previousNarrativeSid ? (localization[previousNarrativeSid] ?? '') : '')
    upgradeDescField.reset(previousUpgradeDescSid, previousUpgradeDescSid ? (localization[previousUpgradeDescSid] ?? '') : '')
    setIcon(str(templateBase.icon, baseCatalogArtifact?.icon ?? ''))
    setSlot(str(templateBase.slot_, SLOT_OPTIONS[0]))
    setRarity(str(templateBase.rarity, RARITY_OPTIONS[0]))
    setGoodsValue(num(templateBase.goodsValue))
    setCostBase(num(templateBase.costBase))
    setCostPerLevel(num(templateBase.costPerLevel))
    setMaxLevel(num(templateBase.maxLevel, 1))
    setRewardForDestroy(num(templateBase.rewardForDestroy))
    setBonuses(bonusArr(templateBase.bonuses))
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
    setMode(existingDefinition.sourceArtifactId ? 'clone' : 'scratch')
    setSynced(true)
  }
  if (!open && (initialized || sourceArtifactId || synced)) {
    setInitialized(false)
    setSourceArtifactId('')
    setSourcePickerValue('')
    setGroundVisualId('')
    setGroundVisualPickerValue('')
    setMode('clone')
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

  const handlePickGroundVisual = (value: string) => {
    setGroundVisualPickerValue(value)
    const knownIds = catalog?.mapObjects.filter((o) => o.category === 'artifacts').map((o) => o.id) ?? []
    if (knownIds.includes(value)) {
      setGroundVisualId(value)
    }
  }

  const trimmedId = id.trim()
  const idTaken =
    trimmedId !== (existingDefinition?.id ?? '') && isArtifactIdTaken(trimmedId, catalog, customArtifacts)

  const canSave =
    readyToEdit &&
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
        slot_: slot,
        rarity,
        goodsValue,
        costBase,
        costPerLevel,
        maxLevel,
        rewardForDestroy,
        upgradeDescription: upgradeDescField.trimmedSid,
        bonuses,
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
        // "Build from scratch" records no specific source artifact — the
        // item's numbers/bonuses were built by hand, not cloned from one.
        sourceArtifactId: mode === 'scratch' ? '' : sourceArtifactId,
        template,
        mapObjectTemplate,
      })

      manageToken(previousNameSid, nameField.trimmedSid, nameField.trimmedText)
      manageToken(previousDescSid, descField.trimmedSid, descField.trimmedText)
      manageToken(previousNarrativeSid, narrativeField.trimmedSid, narrativeField.trimmedText)
      manageToken(previousUpgradeDescSid, upgradeDescField.trimmedSid, upgradeDescField.trimmedText)

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
            Clones a real artifact's definition under a brand-new id, or builds one from scratch —
            the same "clone, edit, ship" mechanism custom objects and heroes use. This app authors
            and ships the definition only; grant it via a script action (e.g. Give Item to Hero) or
            place it on the map in the official Unfrozen map editor once it recognizes the shipped ZIP.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>Mode</Label>
              <FieldInfo text="Clone one artifact: every field starts from a real artifact's own values. Build from scratch: no base artifact — item stats/bonuses start blank, and an optional separate pick supplies just the ground-placement mesh. Switchable at any time." />
            </div>
            <div className="flex gap-1.5">
              <Button type="button" variant={mode === 'clone' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setMode('clone')}>
                Clone one artifact
              </Button>
              <Button
                type="button"
                variant={mode === 'scratch' ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setMode('scratch'); setSourceArtifactId(''); setSourcePickerValue('') }}
              >
                Build from scratch
              </Button>
            </div>
          </div>

          {mode === 'clone' && !sourceArtifactId && (
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

          {mode === 'scratch' && readyToEdit && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>Ground visual (optional)</Label>
                <FieldInfo text="Borrow another real artifact's 3D model/footprint so this one can be placed loose on the map — independent of the item stats/bonuses below. Leave unset if it should only ever be granted via script action." />
              </div>
              {groundVisualId ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{groundVisualDisplayName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => { setGroundVisualId(''); setGroundVisualPickerValue('') }}
                    className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <EntityCombobox
                  value={groundVisualPickerValue}
                  onChange={handlePickGroundVisual}
                  category="artifact"
                  placeholder="Search for an artifact to borrow a ground model from…"
                />
              )}
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

          {readyToEdit && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === 'clone' && sourceArtifactId ? (
                    <>
                      Based on: <span className="font-medium text-foreground">{baseDisplayName}</span>
                      {existingDefinition && ' (already customized)'}
                    </>
                  ) : (
                    'Building from scratch — item stats and bonuses start blank below.'
                  )}
                </p>
                {mode === 'clone' && sourceArtifactId && (
                  <button
                    type="button"
                    onClick={handleChangeBase}
                    className="shrink-0 rounded border border-transparent p-0.5 hover:border-border hover:bg-accent"
                    title="Click to change the base artifact"
                  >
                    <CatalogIcon iconId={baseCatalogArtifact?.icon} name={baseDisplayName} size={24} />
                  </button>
                )}
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

              <LocalizedTextField
                idPrefix="artifact-editor-upgrade-desc"
                managedSidLabel="Upgrade description SID"
                unmanagedLabel="Upgrade description (written directly, no localization)"
                textLabel="Upgrade description text"
                sidValue={upgradeDescField.sidValue}
                textValue={upgradeDescField.textValue}
                autoManageLoc
                onSidChange={upgradeDescField.handleSidChange}
                onTextChange={upgradeDescField.handleTextChange}
                isDuplicate={upgradeDescField.trimmedSid !== previousUpgradeDescSid && upgradeDescField.trimmedSid !== '' && existingSids.includes(upgradeDescField.trimmedSid)}
                optional
                bordered
              />

              {/* ── Item stats ───────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item stats</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Slot</Label>
                    <Select value={slot} onValueChange={setSlot}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SLOT_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rarity</Label>
                    <Select value={rarity} onValueChange={setRarity}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RARITY_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Goods value</Label>
                      <FieldInfo text="Sale/scroll-market value." />
                    </div>
                    <Input type="number" value={goodsValue} onChange={(e) => setGoodsValue(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Max level</Label>
                      <FieldInfo text="How many times this item can be upgraded (item sets/enchanting)." />
                    </div>
                    <Input type="number" value={maxLevel} onChange={(e) => setMaxLevel(Number(e.target.value) || 1)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Reward for destroy</Label>
                      <FieldInfo text="Gold granted when this item is disenchanted/destroyed." />
                    </div>
                    <Input type="number" value={rewardForDestroy} onChange={(e) => setRewardForDestroy(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Cost base</Label>
                      <FieldInfo text="Shop/reward-pool base cost (resource-equivalent value used for balancing, not gold spent directly)." />
                    </div>
                    <Input type="number" value={costBase} onChange={(e) => setCostBase(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>Cost per level</Label>
                      <FieldInfo text="Added to cost base per upgrade level." />
                    </div>
                    <Input type="number" value={costPerLevel} onChange={(e) => setCostPerLevel(Number(e.target.value) || 0)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>

              {/* ── Bonuses ──────────────────────────────────────────────── */}
              <div className="border-t border-border pt-3 space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Bonuses</Label>
                  <FieldInfo text="The mechanical effects this item grants while equipped/held. Each has a type (e.g. heroStat, sideRes, heroMagicAddition) and its own parameters." />
                </div>
                <ArtifactBonusesEditor bonuses={bonuses} onChange={setBonuses} />
              </div>

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
