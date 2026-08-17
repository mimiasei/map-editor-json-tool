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
// Icon (added after issue #146 shipped): real map objects have NO genuine
// "icon" field in their own JSON at all — what this app shows is always
// derived from the object's 3D prefab path stem (collectMapObjects()), so
// there's nothing real to "swap" in the shipped data the way a custom
// artifact's real icon field can be repointed. What this dialog offers
// instead is a purely editor-side display preference
// (CustomMapObjectDefinition.displayIcon) — pick any known object's icon to
// make this custom object easier to tell apart in this app's own sidebar/
// pickers. It is never written into `template` and never shipped; the
// exported clone's JSON is unaffected by it.
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
//
// "Build from scratch" mode (added after `block`/`block_2` — previously
// recommended as a "no native function" base object — turned out to render
// as a smoke/particle effect in-game, not static geometry as its `prefs`
// path name implied): decouples "what it looks like" from "what it does."
// The visual source still clones verbatim (same mechanism as "Clone one
// object" — there's no independent 3D-asset browser possible here; the only
// known-valid `prefs` values are whatever some existing map object already
// references, confirmed by this app's own catalog covering literally every
// Core/DB/map/objects/*.json entry), but its `tag`/`isInteractable` are
// forced to a real interactable regardless of the source's own values, and
// native behavior is a fully independent, opt-in choice (default: none) via
// `logicSourceObjectId`/`noNativeLogic` on CustomMapObjectDefinition — see
// that file for the field semantics.
//
// Attached behavior is editable, not just clonable, when it's shaped like
// Core/DB/objects_logic/event_banks/**/*.json (`isEventBankLogic` —
// visitType + variants[]) — the one family internally consistent enough for
// a generic form (see EventBankLogicEditor.tsx for the full scope/rationale).
// `logicEdits` holds the live draft (seeded from the picked source, or from
// an already-saved definition's `logic` on re-edit); every other family
// still ships as an exact, unedited clone.

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
import { isMapObjectIdTaken } from '@/lib/custom-map-object-authoring'
import EventBankLogicEditor, { isEventBankLogic } from './EventBankLogicEditor'

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

// Confirmed via the official map editor guide's glossary ("Interaction
// cells" — a specific per-object set of bordering cells; a hero can only
// interact by standing on one) plus a direct data comparison across
// Core/DB/map/objects/*.json: every Environment-tagged object's `nodes`
// array only ever uses {0, 1} (no cell flagged as interactable); every real
// Interact-tagged object has at least one `2`, and Unfrozen ships those as a
// deliberately padded template — a real footprint centered in a larger
// grid, with a ring of `2`-flagged border cells and a matching
// generatorConfig. "Build from scratch" mode's visual source is often an
// Environment/decoration/animal/fx object with none of that, so a from-
// scratch object needs the same ring added, or nothing can ever trigger it
// (this is what a user hit in-game: a 1x1 environment visual with no
// interaction cell was simply unwalkable-to-in-a-triggering-way).
function hasInteractionCell(nodes: unknown): boolean {
  return Array.isArray(nodes) && nodes.some((n) => n === 2)
}

function addInteractionRing(
  sizeX: number,
  sizeZ: number,
  nodes: number[],
  pivotX: number | undefined,
  pivotZ: number | undefined,
): Record<string, unknown> {
  const newSizeX = sizeX + 2
  const newSizeZ = sizeZ + 2
  const newNodes = new Array(newSizeX * newSizeZ).fill(2)
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      newNodes[(z + 1) * newSizeX + (x + 1)] = nodes[z * sizeX + x] ?? 1
    }
  }
  const patch: Record<string, unknown> = {
    sizeX: newSizeX,
    sizeZ: newSizeZ,
    nodes: newNodes,
    // Matches watchtower/block_campaign_mountain_dirt's real shape — every
    // real interactable has *some* generatorConfig, so this stays
    // structurally consistent either way. Whether buildingInteractionLayout
    // itself is load-bearing at runtime (vs. map-generator-only metadata)
    // is unconfirmed — not verifiable from data alone, flagged for the
    // in-game test this whole feature already needs.
    generatorConfig: {
      buildingSizeX: sizeX,
      buildingSizeZ: sizeZ,
      buildingLeftBottomX: 1,
      buildingLeftBottomZ: 1,
      buildingInteractionLayout: 3,
    },
  }
  // Same local node-grid coordinate space as `nodes` per the confirmed
  // evidence above, so shifted by the same +1 ring offset — always emitted,
  // not just when the source already had one: every real multi-tile
  // environment object has an explicit pivot (confirmed by scanning
  // 1_environments.json), so the only sources that omit it are 1x1, whose
  // implicit pivot is unambiguously (0,0). Leaving pivot unset here (the
  // previous behavior) silently defaulted to (0,0) in the *new, padded*
  // grid — anchoring the object's corner instead of its center, which is
  // exactly the "-1,-1" visual/interaction-ring offset a user hit in-game.
  patch.pivotX = (pivotX ?? 0) + 1
  patch.pivotZ = (pivotZ ?? 0) + 1
  return patch
}

function parseDebugNodes(text: string): number[] {
  return text
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
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
  const [mode, setMode] = useState<'clone' | 'scratch'>('clone')
  const [noNativeLogic, setNoNativeLogic] = useState(false)
  const [logicSourceObjectId, setLogicSourceObjectId] = useState('')
  const [logicPickerValue, setLogicPickerValue] = useState('')
  const [logicEdits, setLogicEdits] = useState<Record<string, unknown> | null>(null)
  // "Build from scratch" debug panel — raw geometry override, added after
  // two in-game rounds of wrong pivot guesses. Placement anchoring is
  // runtime engine behavior with no documentation or discoverable rule in
  // the game's own data files, so rather than guess a third time, this lets
  // the user iterate on sizeX/sizeZ/nodes/pivot/generatorConfig directly and
  // re-export without needing a new app build each time. Seeded from the
  // computed (padded, if applicable) geometry whenever a fresh visual is
  // picked; overrides it at save time when in scratch mode.
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugSizeX, setDebugSizeX] = useState(1)
  const [debugSizeZ, setDebugSizeZ] = useState(1)
  const [debugPivotX, setDebugPivotX] = useState(0)
  const [debugPivotZ, setDebugPivotZ] = useState(0)
  const [debugBuildingSizeX, setDebugBuildingSizeX] = useState(1)
  const [debugBuildingSizeZ, setDebugBuildingSizeZ] = useState(1)
  const [debugBuildingLeftBottomX, setDebugBuildingLeftBottomX] = useState(0)
  const [debugBuildingLeftBottomZ, setDebugBuildingLeftBottomZ] = useState(0)
  const [debugBuildingInteractionLayout, setDebugBuildingInteractionLayout] = useState(3)
  const [debugNodesText, setDebugNodesText] = useState('')
  // Separate from `initialized` — `mode` may still read 'clone' on the same
  // render `initialized` first flips true (existingDefinition's `mode` sync
  // below runs later, and setMode doesn't take effect until a subsequent
  // render), so seeding debug fields inside that same block could seed the
  // wrong (unpadded) geometry. This flag waits for a render where `mode` has
  // actually settled to 'scratch' before seeding, whichever render that is.
  const [debugSeeded, setDebugSeeded] = useState(false)
  const [id, setId] = useState('')
  const [icon, setIcon] = useState('')
  const [iconBrowserOpen, setIconBrowserOpen] = useState(false)
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
  // "Clone one object" mode's own logic resolution — unchanged from before
  // "build from scratch" mode existed. Only used when mode === 'clone'.
  const logicBase: Record<string, unknown> | undefined =
    existingDefinition?.logic ?? baseCatalogLogic?.raw
  const logicSourcePathBase: string | undefined =
    existingDefinition?.logicSourcePath ?? baseCatalogLogic?.sourcePath
  const baseDisplayName = catalog?.mapObjects.find((o) => o.id === sourceObjectId)?.name ?? sourceObjectId
  const catalogMissing = !!sourceObjectId && !templateBase

  // "Build from scratch" mode: does the visual source need an interaction
  // ring added (see addInteractionRing above)? Naturally idempotent on
  // re-edit — an already-padded existingDefinition.template already has a
  // `2` in its nodes, so this correctly evaluates false and isn't re-padded.
  const templateSizeX = typeof templateBase?.sizeX === 'number' ? templateBase.sizeX : 1
  const templateSizeZ = typeof templateBase?.sizeZ === 'number' ? templateBase.sizeZ : 1
  const templateNodes = Array.isArray(templateBase?.nodes) ? (templateBase.nodes as number[]) : []
  const needsInteractionRing = mode === 'scratch' && !!templateBase && !hasInteractionCell(templateNodes)

  // "Build from scratch" mode's own, fully independent logic resolution —
  // deliberately never falls back to the visual source's own logic (that
  // coupling is exactly what this mode exists to break). "None" (the
  // default) means no logic at all, full stop.
  const logicBearingIds = new Set((catalog?.objectLogics ?? []).map((l) => l.id))
  const scratchLogicSource = catalog?.objectLogics.find((l) => l.id === logicSourceObjectId)
  const scratchLogicDisplayName =
    catalog?.mapObjects.find((o) => o.id === logicSourceObjectId)?.name ?? logicSourceObjectId
  const effectiveLogicBase = mode === 'scratch'
    ? (noNativeLogic ? undefined : (logicEdits ?? undefined))
    : logicBase
  const effectiveLogicSourcePath = mode === 'scratch'
    ? (noNativeLogic ? undefined : (scratchLogicSource?.sourcePath ?? existingDefinition?.logicSourcePath))
    : logicSourcePathBase

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
    setIcon(existingDefinition?.displayIcon ?? baseCatalogObject?.icon ?? '')
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
    const wasScratch = !!existingDefinition.noNativeLogic || !!existingDefinition.logicSourceObjectId
    setMode(wasScratch ? 'scratch' : 'clone')
    setNoNativeLogic(!!existingDefinition.noNativeLogic)
    setLogicSourceObjectId(existingDefinition.logicSourceObjectId ?? '')
    setLogicPickerValue(existingDefinition.logicSourceObjectId ?? '')
    setLogicEdits(
      wasScratch && existingDefinition.logicSourceObjectId && existingDefinition.logic
        ? (JSON.parse(JSON.stringify(existingDefinition.logic)) as Record<string, unknown>)
        : null,
    )
    setSynced(true)
  }

  // Debug panel seeding — see the debugSeeded declaration for why this is a
  // separate block rather than folded into the "seed once per pick" one.
  if (open && templateBase && mode === 'scratch' && !debugSeeded) {
    const padded = needsInteractionRing
      ? addInteractionRing(
          templateSizeX,
          templateSizeZ,
          templateNodes,
          typeof templateBase.pivotX === 'number' ? templateBase.pivotX : undefined,
          typeof templateBase.pivotZ === 'number' ? templateBase.pivotZ : undefined,
        )
      : null
    const gc = (padded?.generatorConfig ?? templateBase.generatorConfig ?? {}) as Record<string, unknown>
    setDebugSizeX(typeof padded?.sizeX === 'number' ? padded.sizeX : templateSizeX)
    setDebugSizeZ(typeof padded?.sizeZ === 'number' ? padded.sizeZ : templateSizeZ)
    setDebugNodesText((Array.isArray(padded?.nodes) ? (padded.nodes as number[]) : templateNodes).join(','))
    setDebugPivotX(typeof padded?.pivotX === 'number' ? padded.pivotX : (typeof templateBase.pivotX === 'number' ? templateBase.pivotX : 0))
    setDebugPivotZ(typeof padded?.pivotZ === 'number' ? padded.pivotZ : (typeof templateBase.pivotZ === 'number' ? templateBase.pivotZ : 0))
    setDebugBuildingSizeX(typeof gc.buildingSizeX === 'number' ? gc.buildingSizeX : templateSizeX)
    setDebugBuildingSizeZ(typeof gc.buildingSizeZ === 'number' ? gc.buildingSizeZ : templateSizeZ)
    setDebugBuildingLeftBottomX(typeof gc.buildingLeftBottomX === 'number' ? gc.buildingLeftBottomX : 0)
    setDebugBuildingLeftBottomZ(typeof gc.buildingLeftBottomZ === 'number' ? gc.buildingLeftBottomZ : 0)
    setDebugBuildingInteractionLayout(typeof gc.buildingInteractionLayout === 'number' ? gc.buildingInteractionLayout : 3)
    setDebugSeeded(true)
  }

  if (!open && (initialized || sourceObjectId || synced)) {
    setInitialized(false)
    setSourceObjectId('')
    setSourcePickerValue('')
    setSynced(false)
    setIcon('')
    setIconBrowserOpen(false)
    setMode('clone')
    setNoNativeLogic(false)
    setLogicSourceObjectId('')
    setLogicPickerValue('')
    setLogicEdits(null)
    setDebugOpen(false)
    setDebugSeeded(false)
  }

  const handleChangeBase = () => {
    setSourceObjectId('')
    setSourcePickerValue('')
    setInitialized(false)
    setDebugSeeded(false)
  }

  const handlePickLogicSource = (value: string) => {
    setLogicPickerValue(value)
    if (logicBearingIds.has(value)) {
      setLogicSourceObjectId(value)
      const source = catalog?.objectLogics.find((l) => l.id === value)
      setLogicEdits(source?.raw ? (JSON.parse(JSON.stringify(source.raw)) as Record<string, unknown>) : null)
    }
  }

  const handleClearLogicSource = () => {
    setLogicSourceObjectId('')
    setLogicPickerValue('')
    setLogicEdits(null)
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
      const template: Record<string, unknown> = mode === 'scratch'
        ? {
            ...templateBase,
            // A visual source with no interaction cell of its own (every
            // Environment/decoration/animal/fx source) gets a ring added —
            // see addInteractionRing's own comment. Spread before the forced
            // tag/isInteractable/identity fields below so it can't override
            // them; spread after ...templateBase so it overrides the
            // source's own (too-small, cell-less) sizeX/sizeZ/nodes.
            ...(needsInteractionRing
              ? addInteractionRing(
                  templateSizeX,
                  templateSizeZ,
                  templateNodes,
                  typeof templateBase?.pivotX === 'number' ? templateBase.pivotX : undefined,
                  typeof templateBase?.pivotZ === 'number' ? templateBase.pivotZ : undefined,
                )
              : {}),
            // Forced regardless of the visual source's own values — it may be
            // a decoration/environment/animal object (tag: "Environment" or
            // no isInteractable field at all), but this is always meant to be
            // a real interactable so Script Template triggers can fire on it.
            tag: 'Interact',
            isInteractable: true,
            // Advanced (debug) override — replaces whatever addInteractionRing
            // computed above with the directly-edited values from the debug
            // panel, so pivot/footprint placement can be iterated on without
            // a new app build. Always applied in scratch mode (debug fields
            // are seeded to match the computed geometry, so this is a no-op
            // until the user actually edits something).
            sizeX: debugSizeX,
            sizeZ: debugSizeZ,
            nodes: parseDebugNodes(debugNodesText),
            pivotX: debugPivotX,
            pivotZ: debugPivotZ,
            generatorConfig: {
              buildingSizeX: debugBuildingSizeX,
              buildingSizeZ: debugBuildingSizeZ,
              buildingLeftBottomX: debugBuildingLeftBottomX,
              buildingLeftBottomZ: debugBuildingLeftBottomZ,
              buildingInteractionLayout: debugBuildingInteractionLayout,
            },
            id: trimmedId,
            name: nameField.trimmedSid,
            description: descField.trimmedSid,
            narrativeDescription: narrativeField.trimmedSid,
          }
        : {
            ...templateBase,
            id: trimmedId,
            name: nameField.trimmedSid,
            description: descField.trimmedSid,
            narrativeDescription: narrativeField.trimmedSid,
          }
      const logic = effectiveLogicBase ? { ...effectiveLogicBase, id: trimmedId } : undefined
      const logicSourcePath = effectiveLogicBase ? effectiveLogicSourcePath : undefined

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
        displayIcon: icon,
        logicSourceObjectId: mode === 'scratch' && logicSourceObjectId ? logicSourceObjectId : undefined,
        noNativeLogic: mode === 'scratch' ? noNativeLogic : undefined,
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

  const iconBrowserOptions = (catalog?.mapObjects ?? [])
    .filter((o): o is typeof o & { icon: string } => !!o.icon)
    .map((o) => ({ id: o.icon, label: o.name }))

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
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Mode</Label>
                  <FieldInfo text="Clone one object: the visual and any native behavior both come from a single existing object, same as before. Build from scratch: pick the visual and native behavior independently — e.g. pick any object purely for its looks, with no native behavior at all, so a Script Template's own scripting is the only thing that happens when a hero interacts with it." />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant={mode === 'clone' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setMode('clone')}
                  >
                    Clone one object
                  </Button>
                  <Button
                    type="button"
                    variant={mode === 'scratch' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setMode('scratch')
                      setNoNativeLogic(true)
                      setLogicSourceObjectId('')
                      setLogicPickerValue('')
                    }}
                  >
                    Build from scratch
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{mode === 'scratch' ? 'Visual' : 'Base object'}</Label>
                  <FieldInfo
                    text={
                      mode === 'scratch'
                        ? 'The real map object supplying this custom object\'s 3D model and footprint only — its own native behavior (if any) is not included. Pick freely for looks; attach native behavior separately below.'
                        : 'The real map object whose definition this custom object clones. Everything except id/name/description/narrative description is copied verbatim, including its 3D asset and footprint.'
                    }
                  />
                </div>
                <EntityCombobox
                  value={sourcePickerValue}
                  onChange={handlePickSource}
                  category="mapObject"
                  placeholder={mode === 'scratch' ? 'Search for any object to use its visual…' : 'Search for an object to clone…'}
                  groupByCategory
                />
              </div>
            </>
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
                  {mode === 'scratch' ? 'Visual: ' : 'Based on: '}
                  <span className="font-medium text-foreground">{baseDisplayName}</span>
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

              {needsInteractionRing && (
                <p className="text-xs text-muted-foreground">
                  This visual has no interaction cells of its own — a 1-tile ring will be added
                  around it so it's actually triggerable (footprint becomes {templateSizeX + 2}×
                  {templateSizeZ + 2}, was {templateSizeX}×{templateSizeZ}).
                </p>
              )}

              {mode === 'scratch' && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setDebugOpen((o) => !o)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {debugOpen ? '▾' : '▸'} Advanced (debug): footprint &amp; pivot
                  </button>
                  {debugOpen && (
                    <div className="space-y-2 rounded-md border border-border p-2">
                      <p className="text-xs text-muted-foreground">
                        Directly edits this object's shipped sizeX/sizeZ/nodes/pivot/generatorConfig
                        — placement anchoring is runtime engine behavior with no documented rule, so
                        this is for iterating on it directly instead of guessing.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Size X</Label>
                          <Input type="number" className="h-7 text-xs" value={debugSizeX} onChange={(e) => setDebugSizeX(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Size Z</Label>
                          <Input type="number" className="h-7 text-xs" value={debugSizeZ} onChange={(e) => setDebugSizeZ(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Pivot X</Label>
                          <Input type="number" className="h-7 text-xs" value={debugPivotX} onChange={(e) => setDebugPivotX(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Pivot Z</Label>
                          <Input type="number" className="h-7 text-xs" value={debugPivotZ} onChange={(e) => setDebugPivotZ(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Building size X</Label>
                          <Input type="number" className="h-7 text-xs" value={debugBuildingSizeX} onChange={(e) => setDebugBuildingSizeX(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Building size Z</Label>
                          <Input type="number" className="h-7 text-xs" value={debugBuildingSizeZ} onChange={(e) => setDebugBuildingSizeZ(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Building left-bottom X</Label>
                          <Input type="number" className="h-7 text-xs" value={debugBuildingLeftBottomX} onChange={(e) => setDebugBuildingLeftBottomX(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Building left-bottom Z</Label>
                          <Input type="number" className="h-7 text-xs" value={debugBuildingLeftBottomZ} onChange={(e) => setDebugBuildingLeftBottomZ(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Building interaction layout</Label>
                          <Input type="number" className="h-7 text-xs" value={debugBuildingInteractionLayout} onChange={(e) => setDebugBuildingInteractionLayout(Number(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nodes (comma-separated, {debugSizeX * debugSizeZ} expected)</Label>
                        <Input
                          className="h-7 text-xs font-mono"
                          value={debugNodesText}
                          onChange={(e) => setDebugNodesText(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mode === 'scratch' && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <div className="flex items-center gap-1">
                    <Label>Native behavior</Label>
                    <FieldInfo text="What happens natively (independent of any Script Template) when a hero interacts with this object. Defaults to none, so a Script Template's own scripting is the only thing that happens — pick an existing object's behavior to attach here only if you actually want native reward/guard/shop logic on top." />
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant={noNativeLogic ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setNoNativeLogic(true)
                        handleClearLogicSource()
                      }}
                    >
                      None
                    </Button>
                    <Button
                      type="button"
                      variant={!noNativeLogic ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setNoNativeLogic(false)}
                    >
                      Attach from another object…
                    </Button>
                  </div>
                  {!noNativeLogic && !logicSourceObjectId && (
                    <EntityCombobox
                      value={logicPickerValue}
                      onChange={handlePickLogicSource}
                      category="mapObject"
                      placeholder="Search for an object with behavior to attach…"
                      restrictToIds={logicBearingIds}
                      groupByCategory
                    />
                  )}
                  {!noNativeLogic && logicSourceObjectId && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Attaching: <span className="font-medium text-foreground">{scratchLogicDisplayName}</span>'s behavior
                          {scratchLogicSource && ` (${scratchLogicSource.sourcePath})`}
                        </p>
                        <button
                          type="button"
                          onClick={handleClearLogicSource}
                          className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Change
                        </button>
                      </div>
                      <div className="rounded-md border border-border p-2">
                        {logicEdits && isEventBankLogic(logicEdits) ? (
                          <EventBankLogicEditor raw={logicEdits} onChange={setLogicEdits} />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            This behavior's settings can't be edited here — shipped as a verbatim clone, same as before.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>Icon</Label>
                  <FieldInfo text="Real map objects have no icon field of their own — the game always uses the object's 3D model, unaffected by this. This only changes how the custom object displays in this app's own sidebar/pickers, to help tell similar objects apart." />
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

              {mode === 'clone' && !logicBase && (
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

      <IconBrowserDialog
        open={iconBrowserOpen}
        onOpenChange={setIconBrowserOpen}
        title="Choose a display icon"
        options={iconBrowserOptions}
        currentIconId={icon}
        onPick={setIcon}
      />
    </Dialog>
  )
}
