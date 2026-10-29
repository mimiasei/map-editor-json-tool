// ─── Map Grid — cell-info column content (issue #125) ───────────────────────
// Props-driven, no direct store reads — rendered both by the docked column
// inside MapGridDialog.tsx (interactive: real Rename/Set-display-name
// actions) and by PanelContent.tsx for the undocked cross-window mirror
// (read-only: onRename/onSetDisplayName simply omitted), same convention as
// QuestFlowContent/TimelineContent (src/components/panels/PanelContent.tsx).
//
// Master-detail layout per issue #125 item 3: a clickable row per item on
// the tile, and a detail panel below for whichever row is selected.

import { localName, localNameById } from '@/lib/catalog/local-name'
import { useEffect, useState } from 'react'
import { CatalogIcon, PortraitThumb, heroPortraitPath } from '@/lib/catalog/thumbnails'
import { groupOf } from '@/lib/map-grid/tile-index'
import { resolveGridCellVisual } from '@/lib/map-grid/cell-visual'
import { formatRewardParam } from '@/lib/map-grid/reward-params'
import type { PlacedObject, MapEntity, ObjectActions } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LinkPortal, PenLine, Tag, UnlinkPortal, UserCog, Wand2, Dices } from '@/components/ui/icons'
import HeroCatalogListEditor from '@/components/tree/HeroCatalogListEditor'
import HeroPickerDialog from '@/components/catalog/HeroPickerDialog'
import RandomSquadExampleDialog from './RandomSquadExampleDialog'
import ObjectActionsEditor from './ObjectActionsEditor'
import RewardSlotEditor from '@/components/tree/RewardSlotEditor'
import { DEFAULT_SQUAD_DIFFICULTY_RANGES, randomInRange, randomSquadDifficultyLabel, squadDifficultyName, type DifficultyRange } from '@/lib/map-grid/squad-pool'
import { useTranslation } from 'react-i18next'

/** Only valid when item.entitySid already exists — used for the Rename flow. */
function toEntity(item: PlacedObject): MapEntity | null {
  if (!item.entitySid) return null
  return {
    sid: item.entitySid,
    id: item.id,
    type: String(item.type),
    x: item.x,
    z: item.z,
    displayName: item.displayName,
  }
}

/** Display-name setting never actually needs an entity SID — the write is
 *  keyed by (type, id), same as propEntities. Falls back to the object's own
 *  sid as a label so "Set display name" can work even before one is assigned
 *  (issue #127 item 4: standard for every interactable, not just named ones).
 *  A city spawner's name lives in a different table entirely (issue #132) —
 *  isCitySpawner tells SetDisplayNameDialog which one to write to. source:
 *  'heroSpawner' tells it to also show the description fields and the
 *  hero-specific caveat, matching how the Entity SIDs sidebar's hero rows
 *  already flag themselves the same way. */
function toDisplayNameEntity(item: PlacedObject): MapEntity {
  return {
    sid: item.entitySid || item.sid,
    id: item.id,
    type: String(item.type),
    x: item.x,
    z: item.z,
    displayName: item.displayName,
    description: item.description,
    isCitySpawner: item.spawnerInfo?.spawnPointType === 0,
    source: item.spawnerInfo?.spawnPointType === 1 ? 'heroSpawner' : undefined,
    // The placed object's own sid (above) is a generic spawner type sid, not
    // the hero it currently holds — issue #139's hero-identity editing needs
    // the real heroSid, which only spawnerInfo carries.
    heroSid: item.spawnerInfo?.spawnPointType === 1 ? item.spawnerInfo?.heroSid : undefined,
  }
}

export interface MapGridCellContentProps {
  items: PlacedObject[]
  /** "Dirt - Tile (6, 8)"-style label — see terrain-colors.ts's terrainLabel(). */
  terrainLabel: string
  catalog: GameCatalog | null
  /** Present only in the docked (interactive) instance — omit for the read-only undocked mirror. */
  onRename?: (entity: MapEntity) => void
  /** issue #160: not rendered for hero spawners — HeroEditorDialog
   *  ("Edit full hero" below) now covers name/description/motto too, so
   *  this would otherwise be a second, overlapping affordance for heroes
   *  specifically. Still the only option for every other entity type. */
  onSetDisplayName?: (entity: MapEntity) => void
  /** issue #141 — opens the full hero-authoring dialog. Docked-only, like
   *  the above. */
  onEditFullHero?: (entity: MapEntity) => void
  /** "No Combine Geometry" toggle (issue #125 item 4) — docked-only, like the above. */
  onSetNoCombineGeometry?: (item: PlacedObject, value: boolean) => void
  /** Give a brand-new entity SID to an item that has none yet (requires No Combine Geometry on first, for non-interactables). */
  onAssignEntitySid?: (item: PlacedObject, sid: string) => void
  /** For the assign-SID uniqueness check — every entity SID already in use. */
  existingSids?: string[]
  /** Editable "Player type" (issue #125 item 5) — docked-only. "Player attached
   *  to this spawner" has no setter here by design (Unfrozen's own guide flags
   *  reassigning it as bug-prone; this editor only changes the type, not the slot). */
  onSetSpawnerPlayerType?: (item: PlacedObject, spawnType: 0 | 1 | 2) => void
  /** The map's player slot count (Block 1 spawns.playersCount), for the
   *  city-spawner owner dropdown's options (1..playersCount). */
  playersCount?: number
  /** Reassign a city- or hero-spawner's owner — swaps with whichever other
   *  spawner (city or hero) currently holds that slot, if any (issue:
   *  player-assignment UI). Docked-only, like the above. */
  onSetSpawnerOwner?: (item: PlacedObject, newOwner: number) => void
  /** Set a city spawner's faction, '' for random — docked-only, like the above. */
  onSetCityFaction?: (item: PlacedObject, factionSid: string) => void
  /** Toggle whether a city spawner comes with a companion hero (always random
   *  when on — GME gives no way to pick a specific one) — docked-only, like the above. */
  onSetCitySpawnHero?: (item: PlacedObject, spawnHero: boolean) => void
  /** Set a hero spawner's own hero, or 'random' — docked-only, like the above. */
  onSetHeroSid?: (item: PlacedObject, heroSid: string) => void
  /** A random-hero's owning player — an existing one, no new slot (unlike the spawners). */
  onSetObjectOwner?: (item: PlacedObject, owner: number) => void
  /** A random city's faction, '' for random. */
  onSetRandomCityFaction?: (item: PlacedObject, factionSid: string) => void
  /** A random-hero's hero, or 'random'. */
  onSetObjectHero?: (item: PlacedObject, heroSid: string) => void
  /** Replace (or, with null, remove) an object's or zone's Actions Before/After — docked-only. */
  onSetObjectActions?: (item: PlacedObject, which: 'before' | 'after', value: ObjectActions | null) => void
  /** A zone's Activate / Delete-after-trigger switches — docked-only. */
  onSetMarkerState?: (item: PlacedObject, isActivate: boolean, isDelete: boolean) => void
  /** Every portal instance on the map, for the target picker (issue #127 item 8). */
  allPortals?: PlacedObject[]
  /** Change which portal this one connects to, and/or its active state — docked-only. */
  onSetPortalTarget?: (item: PlacedObject, patch: { targetIdx?: number; isActive?: boolean }) => void
  /** Sids that are portals even when they have no link row yet (a freshly placed portal has none). */
  portalSids?: ReadonlySet<string>
  /** Arms the pick mode: the next portal clicked on the grid is linked with this one, both ways. Docked-only. */
  onStartPortalLink?: (item: PlacedObject) => void
  /** Frees this portal and its partner. */
  onUnlinkPortal?: (item: PlacedObject) => void
  /** The tile currently highlighted on the grid (from "Highlight on grid" below), or null. */
  highlightedNode?: number | null
  /** Docked-only — the undocked mirror can't drive the main window's grid overlay. */
  onSetHighlightedNode?: (node: number | null) => void
  /** Set a guard squad's units on a plain object (issue #143) — docked-only,
   *  like the above. Confirmed on interactables in real shipped maps; never
   *  observed on a mine specifically, though nothing in the schema prevents it. */
  onSetGuardSquad?: (item: PlacedObject, unitProps: { sid: string; count: number }[]) => void
  /** Set a city's starting garrison (squad template sids, not creature sids —
   *  issue #143) — docked-only, like the above. */
  onSetCityGarrison?: (item: PlacedObject, sids: string[]) => void
  /** Set a random-squad's requestedValue ("army value" the game rolls a
   *  matching squad against) — docked-only, like the above. */
  onSetRandomSquadValue?: (item: PlacedObject, requestedValue: number) => void
  onSetRandomSquadFraction?: (item: PlacedObject, fraction: string) => void
  /** Difficulty labels/min/max for the Value field's badge + quick-pick
   *  buttons — the (possibly user-customized, Map Grid settings' Advanced
   *  section) live ranges. Defaults to DEFAULT_SQUAD_DIFFICULTY_RANGES for
   *  the undocked mirror, which doesn't wire this through. */
  squadDifficultyRanges?: DifficultyRange[]
  /** Set every reward slot's value at once (issue #143) — docked-only, like the above. */
  onSetRewardParams?: (item: PlacedObject, parameters: string[]) => void
  /** The parent's active move, if any (issue #167 Phase A) — only relevant
   *  when `key` matches `selected.key`, compared locally below since the
   *  parent doesn't know which stacked item this panel currently shows. */
  moveTarget?: { key: string; x: number; z: number } | null
  /** Start moving `item` — enters "pick a destination" mode on the grid
   *  (click a tile, or use arrow keys); each click/arrow-key press relocates
   *  it immediately (issue #195 follow-up — no separate Save step). Docked-only. */
  onStartMove?: (item: PlacedObject) => void
  /** Exit move mode — does not revert any relocation already applied while
   *  it was active (there's no "staged, discardable" position anymore, only
   *  Ctrl+Z). Docked-only. */
  onCancelMove?: () => void
  /** Step `item`'s rotation by one quadrant in either direction — applies
   *  immediately (issue #195 follow-up). Docked-only. */
  onStepRotate?: (item: PlacedObject, delta: 1 | -1) => void
  /** Flip `item` horizontally (rotations[] +10 offset), keeping its quadrant. Docked-only. */
  onSetMirrored?: (item: PlacedObject, mirrored: boolean) => void
  /** The parent's active delete confirmation, if any (issue #167 Phase C) —
   *  same "compared locally against selected.key" convention as moveTarget. */
  deleteTarget?: { key: string } | null
  /** "trigger [0,1,2]"/"dialog [id, slideId]"-style descriptions of every
   *  place the target's entitySid is referenced — computed by the parent via
   *  entity-usage.ts, shown so deleting doesn't silently orphan a reference. */
  deleteUsageWarnings?: string[]
  /** Arm a delete confirmation for `item` — nothing is written until
   *  onConfirmDelete. Docked-only. */
  onStartDelete?: (item: PlacedObject) => void
  /** Apply the delete immediately (issue #195 follow-up). Docked-only. */
  onConfirmDelete?: () => void
  /** Dismiss the confirmation without deleting anything. Docked-only. */
  onCancelDelete?: () => void
  /** Reports whichever row is currently resolved as `selected` below, so a
   *  parent-level keyboard shortcut (Delete/Backspace) can target the right
   *  item on a multi-item tile — selectedKey itself stays local/undocked-safe. */
  onSelectionChange?: (item: PlacedObject | null) => void
  /** Subject-first trigger creation — jumps to the Scenario Editor with a new
   *  Trigger seeded from this object. Requires an entity SID (scripting needs
   *  a stable reference); objects/squads only, not markers/zones. Docked-only,
   *  like the other handlers above. */
  onCreateRule?: (item: PlacedObject) => void
  /** Move `item` one place up (-1, toward the front) or down (1) in this tile's stack. Docked-only. */
  onMoveInStack?: (item: PlacedObject, delta: -1 | 1) => void
}

const PLAYER_TYPE_KEYS = ['player', 'bot', 'unknown'] as const

/** `rotation` is a 0-3 quadrant enum (0/90/180/270°) with a `+10` offset for
 *  a mirrored variant (10-13) — confirmed against every real sample map's
 *  rotations[] values (only {0,1,2,3,10,11,12,13} ever occur). */
function formatRotation(rotation: number): string {
  const degrees = (rotation % 10) * 90
  return rotation >= 10 ? `${degrees}° (mirrored)` : `${degrees}°`
}

export default function MapGridCellContent({
  items,
  terrainLabel,
  catalog,
  onRename,
  onSetDisplayName,
  onEditFullHero,
  onSetNoCombineGeometry,
  onAssignEntitySid,
  existingSids = [],
  onSetSpawnerPlayerType,
  playersCount = 0,
  onSetSpawnerOwner,
  onSetCityFaction,
  onSetCitySpawnHero,
  onSetHeroSid,
  onSetObjectOwner,
  onSetObjectHero,
  onSetRandomCityFaction,
  onSetObjectActions,
  onSetMarkerState,
  allPortals = [],
  onSetPortalTarget,
  portalSids,
  onStartPortalLink,
  onUnlinkPortal,
  highlightedNode = null,
  onSetHighlightedNode,
  onSetGuardSquad,
  onSetCityGarrison,
  onSetRandomSquadValue,
  onSetRandomSquadFraction,
  squadDifficultyRanges = DEFAULT_SQUAD_DIFFICULTY_RANGES,
  onSetRewardParams,
  moveTarget = null,
  onStartMove,
  onCancelMove,
  onStepRotate,
  onSetMirrored,
  deleteTarget = null,
  deleteUsageWarnings = [],
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  onSelectionChange,
  onCreateRule,
  onMoveInStack,
}: MapGridCellContentProps) {
  const { t } = useTranslation()
  const [selectedKey, setSelectedKey] = useState<string | null>(items[0]?.key ?? null)
  const [newSidInput, setNewSidInput] = useState('')
  // Hero-spawner only, local-only (never written) — just narrows the hero
  // browser below, since a hero-spawner has no propCities row to persist a
  // faction to; the faction becomes implicit once a specific hero is picked.
  const [heroFactionFilter, setHeroFactionFilter] = useState<string>('')
  const [heroPickerOpen, setHeroPickerOpen] = useState(false)
  // Every other field on this panel commits straight to the in-memory
  // document on change/click (issue #203 — a "Save to .map" button here was
  // a pre-#195 leftover that never actually gated a real disk write, since
  // every onSet* prop already goes through the same synchronous applyEdit
  // every other control in the app calls unconditionally). The random-squad
  // Value field is the one exception: it's free-typed, so committing per
  // keystroke would spam the edit history — this stays a local draft,
  // committed on blur instead.
  const [draftRandomSquadValue, setDraftRandomSquadValue] = useState<number | null>(null)
  const [squadExampleOpen, setSquadExampleOpen] = useState(false)

  // A newly-clicked tile arrives as a new `items` array — default back to
  // the first row rather than keeping a stale selection from the old tile.
  // Rearranging the stack hands in a new array too; the selection stays on its object then.
  useEffect(() => {
    setSelectedKey((prev) => (prev !== null && items.some((i) => i.key === prev) ? prev : items[0]?.key ?? null))
  }, [items])

  const selected = items.find((i) => i.key === selectedKey) ?? items[0] ?? null
  const renameEntity = selected ? toEntity(selected) : null

  useEffect(() => {
    onSelectionChange?.(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => { setNewSidInput('') }, [selected?.key])
  useEffect(() => { setHeroFactionFilter('') }, [selected?.key])
  useEffect(() => { setDraftRandomSquadValue(null) }, [selected?.key])

  const catalogEntry = catalog?.mapObjects.find((o) => o.id === selected?.sid)
  const isCatalogInteractable = !!catalogEntry?.isInteractable
  const canToggleNoCombine = !!selected && !!catalogEntry && !isCatalogInteractable
  // issue #127 item 4: entity SID + display name are "standard" for every
  // interactable item, not just ones a map author already happened to name —
  // non-interactables still reach the same fields via No Combine Geometry first.
  // issue #130: markers ("trigger zones") have no catalog match and no
  // No-Combine-Geometry concept, but are always nameable per the official
  // guide's own design (zones exist specifically to be referenced by scripts).
  const canAssignSid = isCatalogInteractable || selected?.noCombineGeometry === true || selected?.type === 1
  const canManageEntity = !!selected && (canAssignSid || !!selected.entitySid)
  // issue #132: a city spawner's name is stored in a different table
  // (propCities.customCityName), not propsName — labeled distinctly here so
  // it's not confused with the generic per-object display name.
  const isCitySpawner = selected?.spawnerInfo?.spawnPointType === 0
  const isHeroSpawner = selected?.spawnerInfo?.spawnPointType === 1
  const trimmedSid = newSidInput.trim()
  const sidTaken = trimmedSid !== '' && existingSids.includes(trimmedSid)

  // A portal placed on the grid has no link row until it is first linked; it still gets the Portal section (unlinked, active).
  const portalInfo: NonNullable<PlacedObject['portalInfo']> | undefined = selected?.portalInfo
    ?? (selected && selected.type === 0 && portalSids?.has(selected.sid)
      ? { id: selected.id, targetIdx: undefined, targetNode: undefined, isActive: true, linkKind: 'unlinked' }
      : undefined)
  const connectedPortal = portalInfo?.targetNode !== undefined
    ? allPortals.find((p) => p.node === portalInfo.targetNode)
    : undefined
  const isHighlightingConnected = portalInfo?.targetNode !== undefined && highlightedNode === portalInfo.targetNode

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <p className="text-sm font-semibold">{terrainLabel}</p>
        <p className="text-xs text-muted-foreground">
          {t(items.length > 1 ? 'mapGrid.mapGridCellContent.itemCountStacked' : 'mapGrid.mapGridCellContent.itemCount', { count: items.length })}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">{t('mapGrid.mapGridCellContent.nothingOnThisTile')}</p>
        )}
        {items.map((item) => {
          const group = groupOf(item, catalog)
          const name = item.displayName || item.entitySid || item.sid
          const isSelected = item.key === selected?.key
          const index = items.indexOf(item)
          return (
            <div key={item.key} className={cn('flex items-center border-b border-border/50 transition-colors', isSelected ? 'bg-accent' : 'hover:bg-accent/50')}>
            <button
              onClick={() => setSelectedKey(item.key)}
              className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left"
            >
              {(() => {
                const visual = resolveGridCellVisual(item, catalog)
                if (visual.kind === 'icon') return <visual.Icon size={24} className="shrink-0" />
                if (visual.kind === 'text') return <span className="text-[10px] font-semibold shrink-0 w-6 text-center">{visual.text}</span>
                if (visual.kind === 'render') return <CatalogIcon iconId={item.sid} name={name} size={24} src={visual.render.src} />
                if (visual.kind === 'catalogOverride') return <CatalogIcon iconId={visual.iconId} name={visual.name} size={24} />
                return <CatalogIcon iconId={item.sid} name={name} size={24} />
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {group ? t(`mapGrid.groups.${group}`) : item.sid}
                </p>
              </div>
            </button>
            {onMoveInStack && items.length > 1 && (
              <div className="flex shrink-0 pr-1">
                <button
                  className="p-1 rounded hover:bg-background/60 disabled:opacity-30 disabled:pointer-events-none"
                  title={t('mapGrid.mapGridCellContent.bringForward')}
                  disabled={index === 0}
                  onClick={() => onMoveInStack(item, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1 rounded hover:bg-background/60 disabled:opacity-30 disabled:pointer-events-none"
                  title={t('mapGrid.mapGridCellContent.sendBackward')}
                  disabled={index === items.length - 1}
                  onClick={() => onMoveInStack(item, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="border-t border-border shrink-0 max-h-[55%] overflow-y-auto p-3 space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.objectSID')}</p>
            <p className="font-mono text-xs truncate">{selected.sid}</p>
          </div>

          {(() => {
            const isMoving = moveTarget?.key === selected.key
            return (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.position')}</p>
                {isMoving ? (
                  <div className="space-y-1.5">
                    <p className="text-xs">({selected.x}, {selected.z})</p>
                    <p className="text-xs text-muted-foreground">
                      {t('mapGrid.mapGridCellContent.clickATileOnThe')}
                    </p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancelMove}>
                      {t('shared.done')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xs">({selected.x}, {selected.z})</p>
                    {onStartMove && (
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => onStartMove(selected)}>
                        {t('mapGrid.mapGridCellContent.move')}
                      </Button>
                    )}
                    {onStartDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs text-destructive hover:text-destructive"
                        onClick={() => onStartDelete(selected)}
                      >
                        {t('common.themeEditorDialog.delete')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* A template only supports rotation in-game when its own catalog
              entry carries the randomRotation field at all (true or false)
              — interactables/artifacts/spawns/resources/fxs essentially
              never do, even though every type-0 instance still carries a
              rotations[] value regardless (see MapGridDialog's
              catalogSupportsRotation for the full survey/reasoning). */}
          {selected.type === 0 && selected.rotation !== undefined &&
            catalog?.mapObjects.find((o) => o.id === selected.sid)?.randomRotation !== undefined && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.rotation')}</p>
              <div className="flex items-center gap-1.5">
                {onStepRotate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onStepRotate(selected, -1)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                )}
                <p className="text-xs w-24">{formatRotation(selected.rotation)}</p>
                {onStepRotate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onStepRotate(selected, 1)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* GME offers Mirrored for interactables only (decorations have free rotation instead). */}
          {selected.type === 0 && selected.rotation !== undefined &&
            catalog?.mapObjects.find((o) => o.id === selected.sid)?.category === 'interactables' && (
            <div className="flex items-center gap-2">
              <Switch
                id="mgc-mirrored"
                checked={selected.rotation >= 10}
                disabled={!onSetMirrored}
                onCheckedChange={(on) => onSetMirrored?.(selected, on)}
              />
              <Label htmlFor="mgc-mirrored" className="text-xs">{t('mapGrid.mapGridCellContent.mirrored')}</Label>
            </div>
          )}

          {deleteTarget?.key === selected.key && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="text-xs font-semibold text-destructive">{t('mapGrid.mapGridCellContent.deleteThisObject')}</p>
              <p className="text-xs text-muted-foreground">
                {t('mapGrid.mapGridCellContent.thisRemovesItAndEvery')}
              </p>
              {deleteUsageWarnings.length > 0 && (
                <div className="space-y-1 rounded bg-amber-500/10 p-1.5">
                  <p className="text-xs font-medium text-amber-600">
                    {t('mapGrid.mapGridCellContent.referencedBy', { count: deleteUsageWarnings.length })}
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {deleteUsageWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={onConfirmDelete}>
                  {t('common.themeEditorDialog.delete')}
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancelDelete}>
                  {t('shared.cancel')}
                </Button>
              </div>
            </div>
          )}

          {selected.isActive === false && (
            <Badge variant="secondary" className="text-amber-500 text-xs">
              {t('mapGrid.mapGridCellContent.inactiveAtStart')}
            </Badge>
          )}
          {selected.owner !== undefined && selected.sid !== 'random-city' && (
            <div>
              <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.owner')}</p>
              <p className="text-xs">{selected.owner === -1 ? t('common.generateRandomMapDialog.none') : `Player ${selected.owner}`}</p>
            </div>
          )}
          {selected.entitySid && (
            <div>
              <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.entitySID')}</p>
              <p className="font-mono text-xs truncate">{selected.entitySid}</p>
            </div>
          )}
          {selected.displayName && (
            <div>
              <p className="text-xs text-muted-foreground">
                {isCitySpawner ? t('mapGrid.mapGridCellContent.cityName') : t('mapGrid.mapGridCellContent.displayName')}
              </p>
              <p className="text-xs truncate">{selected.displayName}</p>
            </div>
          )}
          {selected && canManageEntity && renameEntity && onRename && (
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onRename(renameEntity)}>
                <PenLine className="h-3 w-3" />
                {t('mapGrid.mapGridCellContent.renameSID')}
              </Button>
              {onSetDisplayName && !isHeroSpawner && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSetDisplayName(toDisplayNameEntity(selected))}>
                  <Tag className="h-3 w-3" />
                  {isCitySpawner ? t('mapGrid.mapGridCellContent.setCityName') : t('mapGrid.mapGridCellContent.setDisplayName')}
                </Button>
              )}
              {isHeroSpawner && onEditFullHero && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onEditFullHero(toDisplayNameEntity(selected))}>
                  <UserCog className="h-3 w-3" />
                  {t('mapGrid.mapGridCellContent.editFullHero')}
                </Button>
              )}
            </div>
          )}

          {selected && (selected.type === 0 || selected.type === 2) && onCreateRule && (
            <div className="pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onCreateRule(selected)}>
                <Wand2 className="h-3 w-3" />
                {t('mapGrid.mapGridCellContent.createARuleForThis')}
              </Button>
            </div>
          )}

          {selected && canManageEntity && !selected.entitySid && (
            <div className="space-y-2 pt-1">
              {onAssignEntitySid && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.assignEntitySID')}</p>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={newSidInput}
                      onChange={(e) => setNewSidInput(e.target.value)}
                      className="h-7 text-xs font-mono"
                      placeholder={t('mapGrid.mapGridCellContent.entitySid')}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      disabled={!trimmedSid || sidTaken}
                      onClick={() => { onAssignEntitySid(selected, trimmedSid); setNewSidInput('') }}
                    >
                      {t('mapGrid.mapGridCellContent.assign')}
                    </Button>
                  </div>
                  {sidTaken && <p className="text-xs text-destructive">{t('mapGrid.mapGridCellContent.anotherEntityAlreadyUsesThis')}</p>}
                </div>
              )}
              {onSetDisplayName && !isHeroSpawner && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSetDisplayName(toDisplayNameEntity(selected))}>
                  <Tag className="h-3 w-3" />
                  {isCitySpawner ? t('mapGrid.mapGridCellContent.setCityName') : t('mapGrid.mapGridCellContent.setDisplayName')}
                </Button>
              )}
              {isHeroSpawner && onEditFullHero && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onEditFullHero(toDisplayNameEntity(selected))}>
                  <UserCog className="h-3 w-3" />
                  {t('mapGrid.mapGridCellContent.editFullHero')}
                </Button>
              )}
            </div>
          )}

          {selected && canToggleNoCombine && onSetNoCombineGeometry && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mgc-no-combine"
                  checked={selected.noCombineGeometry ?? false}
                  onCheckedChange={(c) => onSetNoCombineGeometry(selected, c === true)}
                />
                <Label htmlFor="mgc-no-combine" className="text-xs cursor-pointer">
                  {t('mapGrid.mapGridCellContent.noCombineGeometry')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('mapGrid.mapGridCellContent.letsThisDecorationCarryAn')}
              </p>
            </div>
          )}

          {selected.spawnerInfo && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">{t('shared.spawner')}</p>
              {(() => {
                const info = selected.spawnerInfo!
                const isCitySpawnerHere = info.spawnPointType === 0
                const currentFactionSid = isCitySpawnerHere ? (info.factionSid ?? '') : heroFactionFilter
                const currentSpawnHero = info.spawnHero ?? false
                const currentHeroSid = info.heroSid ?? 'random'
                const factionName = (sid: string) => {
                  const faction = catalog?.factions.find((f) => f.id === sid)
                  const name = faction ? localName(catalog, 'factions', faction) : undefined
                  return name ? `${name} (${sid})` : sid
                }
                const canEditFaction = isCitySpawnerHere ? !!onSetCityFaction : !!onSetHeroSid
                return (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{t('common.statsDialog.faction')}</p>
                      {canEditFaction ? (
                        <Select
                          value={currentFactionSid || 'random'}
                          onValueChange={(v) => {
                            const sid = v === 'random' ? '' : v
                            if (isCitySpawnerHere) onSetCityFaction!(selected, sid)
                            else setHeroFactionFilter(sid)
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs mt-0.5 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random">{t('common.generateRandomMapDialog.random')}</SelectItem>
                            {(catalog?.factions ?? []).map((f) => (
                              <SelectItem key={f.id} value={f.id}>{localName(catalog, 'factions', f)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs">{currentFactionSid ? factionName(currentFactionSid) : t('common.generateRandomMapDialog.random')}</p>
                      )}
                    </div>

                    {isCitySpawnerHere && (
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 text-xs">
                          {onSetCitySpawnHero ? (
                            <Checkbox
                              checked={currentSpawnHero}
                              onCheckedChange={(v) => onSetCitySpawnHero(selected, v === true)}
                            />
                          ) : (
                            <Checkbox checked={currentSpawnHero} disabled />
                          )}
                          {t('mapGrid.mapGridCellContent.spawnsWithHero')}
                        </label>
                        {currentSpawnHero && <p className="text-xs text-muted-foreground pl-6">{t('mapGrid.mapGridCellContent.randomHero')}</p>}
                      </div>
                    )}

                    {!isCitySpawnerHere && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t('common.statsDialog.hero')}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs">{currentHeroSid === 'random' ? t('common.generateRandomMapDialog.random') : currentHeroSid}</p>
                          {onSetHeroSid && (
                            <>
                              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setHeroPickerOpen(true)}>
                                {t('mapGrid.mapGridCellContent.browse')}
                              </Button>
                              {currentHeroSid !== 'random' && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onSetHeroSid(selected, 'random')}>
                                  {t('mapGrid.mapGridCellContent.setToRandom')}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        {onSetHeroSid && (
                          <HeroPickerDialog
                            open={heroPickerOpen}
                            onOpenChange={setHeroPickerOpen}
                            value={currentHeroSid !== 'random' ? currentHeroSid : undefined}
                            lockedFaction={heroFactionFilter || undefined}
                            onSelect={(entry) => { if (entry.heroId) onSetHeroSid(selected, entry.heroId) }}
                          />
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
              {isCitySpawner && (
                <div>
                  <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.spawnerType')}</p>
                  <p className="text-xs">{t('shared.city')}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.playerAttachedToThisSpawner')}</p>
                {onSetSpawnerOwner && playersCount > 0 ? (
                  <Select
                    value={String(selected.spawnerInfo.owner)}
                    onValueChange={(v) => onSetSpawnerOwner(selected, Number(v))}
                  >
                    <SelectTrigger className="h-7 text-xs mt-0.5 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: playersCount }, (_, i) => i + 1).map((p) => (
                        <SelectItem key={p} value={String(p)}>{t('mapGrid.mapGridCellContent.player', { p })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs">{t('shared.player2', { owner: selected.spawnerInfo.owner })}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.playerType')}</p>
                {onSetSpawnerPlayerType ? (
                  <div className="flex gap-1">
                    {PLAYER_TYPE_KEYS.map((typeKey, idx) => (
                      <button
                        key={typeKey}
                        onClick={() => onSetSpawnerPlayerType(selected, idx as 0 | 1 | 2)}
                        className={cn(
                          'h-6 px-2 text-xs rounded border transition-colors',
                          selected.spawnerInfo!.spawnType === idx
                            ? 'bg-background text-foreground border-border'
                            : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground',
                        )}
                      >
                        {t(`mapGrid.mapGridCellContent.playerTypes.${typeKey}`)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs">{t(`mapGrid.mapGridCellContent.playerTypes.${PLAYER_TYPE_KEYS[selected.spawnerInfo.spawnType] ?? 'unknown'}`)}</p>
                )}
              </div>
            </div>
          )}

          {/* A free-standing random city: owner (None, or a player) and faction. propOwners counts players from 0, so stored 0 is the Player 1
              GME shows (GME read a city without a row as Player 1 and saved 0), while Block 1 spawns and the hero code above start at 1. */}
          {selected && selected.sid === 'random-city' && (() => {
            const owner = selected.owner ?? -1
            const ownerOptions = [-1, ...Array.from({ length: playersCount }, (_, i) => i)]
            if (!ownerOptions.includes(owner)) ownerOptions.push(owner)
            const ownerLabel = (v: number) => (v === -1 ? 'None' : `Player ${v + 1}`)
            const factionSid = selected.cityFactionSid ?? ''
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.randomCity')}</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.owner')}</p>
                  {onSetObjectOwner ? (
                    <Select value={String(owner)} onValueChange={(v) => onSetObjectOwner(selected, Number(v))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ownerOptions.map((p) => (
                          <SelectItem key={p} value={String(p)}>{ownerLabel(p)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs">{ownerLabel(owner)}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('common.statsDialog.faction')}</p>
                  {onSetRandomCityFaction ? (
                    <Select
                      value={factionSid || 'random'}
                      onValueChange={(v) => onSetRandomCityFaction(selected, v === 'random' ? '' : v)}
                    >
                      <SelectTrigger className="h-7 text-xs mt-0.5 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="random">{t('common.generateRandomMapDialog.random')}</SelectItem>
                        {(catalog?.factions ?? []).map((f) => (
                          <SelectItem key={f.id} value={f.id}>{localName(catalog, 'factions', f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs">{factionSid ? localNameById(catalog, 'factions', factionSid, catalog?.factions.find((f) => f.id === factionSid)?.name ?? factionSid) : t('common.generateRandomMapDialog.random')}</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* A free-standing random hero: unlike the hero spawner it takes no new
              player slot, it belongs to a player that already exists. */}
          {selected && selected.sid === 'random-hero' && !selected.spawnerInfo && (() => {
            const heroSid = selected.heroSid ?? 'random'
            const pickedHero = heroSid !== 'random' ? catalog?.heroes.find((h) => h.id === heroSid) : undefined
            const heroName = heroSid === 'random' ? 'Random' : (pickedHero?.name ?? heroSid)
            const owner = selected.owner
            const ownerOptions = Array.from({ length: playersCount }, (_, i) => i + 1)
            if (owner !== undefined && !ownerOptions.includes(owner)) ownerOptions.push(owner)
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.randomHero')}</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('shared.player')}</p>
                  {onSetObjectOwner ? (
                    <Select
                      value={owner !== undefined ? String(owner) : undefined}
                      onValueChange={(v) => onSetObjectOwner(selected, Number(v))}
                    >
                      <SelectTrigger className="h-7 text-xs mt-0.5 w-28">
                        <SelectValue placeholder={t('mapGrid.mapGridCellContent.notSet')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ownerOptions.map((p) => (
                          <SelectItem key={p} value={String(p)}>{p === -1 ? t('common.generateRandomMapDialog.none') : `Player ${p}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs">{owner === undefined ? t('mapGrid.mapGridCellContent.notSet') : owner === -1 ? t('common.generateRandomMapDialog.none') : `Player ${owner}`}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('common.statsDialog.hero')}</p>
                  <div className="flex items-start gap-2">
                    {/* Portrait with the name under it; "Random" has no portrait. */}
                    <div className="flex w-16 shrink-0 flex-col items-center gap-0.5">
                      {heroSid !== 'random' && (
                        <PortraitThumb
                          iconId={pickedHero?.icon}
                          name={heroName}
                          size={56}
                          height={56}
                          previewSize={256}
                          resolve={heroPortraitPath}
                        />
                      )}
                      <p className="w-full break-words text-center text-[11px] leading-tight">{heroName}</p>
                    </div>
                    {onSetObjectHero && (
                      <div className="flex flex-col items-start gap-1">
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setHeroPickerOpen(true)}>
                          {t('mapGrid.mapGridCellContent.browse')}
                        </Button>
                        {heroSid !== 'random' && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onSetObjectHero(selected, 'random')}>
                            {t('mapGrid.mapGridCellContent.setToRandom')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {onSetObjectHero && (
                    <HeroPickerDialog
                      open={heroPickerOpen}
                      onOpenChange={setHeroPickerOpen}
                      value={heroSid !== 'random' ? heroSid : undefined}
                      onSelect={(entry) => { if (entry.heroId) onSetObjectHero(selected, entry.heroId) }}
                    />
                  )}
                </div>
              </div>
            )
          })()}

          {selected
            && (selected.type === 0 ? !selected.isCity && !isHeroSpawner : selected.type === 2)
            && (selected.guardUnitProps !== undefined || onSetGuardSquad) && (() => {
              const guardRows = selected.guardUnitProps ?? []
              // A standalone squads[] placement (type 2) isn't "guarding"
              // anything — it IS the unit — so "Guard" would read oddly;
              // everything else about this editor (HeroCatalogListEditor,
              // onSetGuardSquad → upsertPropSquads) is already generic on
              // entityType and needs no further change.
              const heading = selected.type === 2 ? 'Composition' : 'Guard'
              return (
                <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground">{heading}</p>
                  {onSetGuardSquad ? (
                    <HeroCatalogListEditor
                      category="creature"
                      rows={guardRows}
                      onChange={(rows) => onSetGuardSquad(selected, rows)}
                      maxRows={12}
                      refField="sid"
                      emptyRow={{ sid: '', count: 1 }}
                      addLabel={t('mapGrid.mapGridCellContent.addUnit')}
                      renderExtraFields={(row, _i, update) => (
                        <Input
                          type="number"
                          value={row.count}
                          onChange={(e) => update({ count: Number(e.target.value) || 1 })}
                          className="h-8 w-16 text-xs"
                          title={t('common.playerBalancePanel.count')}
                        />
                      )}
                    />
                  ) : (
                    <ul className="text-xs list-disc list-inside space-y-0.5">
                      {guardRows.map((u, i) => (
                        <li key={i}>{t('mapGrid.mapGridCellContent.guardRow', { name: localNameById(catalog, 'creatures', u.sid, catalog?.creatures.find((c) => c.id === u.sid)?.name ?? u.sid), n: u.count })}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selected.type === 2
                      ? t('mapGrid.mapGridCellContent.leaveEmptyForARandomized')
                      : t('mapGrid.mapGridCellContent.confirmedOnInteractableObjectsIn')}
                  </p>
                </div>
              )
            })()}

          {selected && selected.isCity && (selected.citySquadSids !== undefined || onSetCityGarrison) && (() => {
            const garrisonSids = selected.citySquadSids ?? []
            const garrisonRows = garrisonSids.map((sid) => ({ sid }))
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.garrison')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('mapGrid.mapGridCellContent.squadTemplatesThisCityStarts')}
                </p>
                {onSetCityGarrison ? (
                  <HeroCatalogListEditor
                    category="squadTemplate"
                    rows={garrisonRows}
                    onChange={(rows) => onSetCityGarrison(selected, rows.map((r) => r.sid))}
                    maxRows={5}
                    refField="sid"
                    emptyRow={{ sid: '' }}
                    addLabel={t('mapGrid.mapGridCellContent.addSquad')}
                    renderExtraFields={() => null}
                  />
                ) : (
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    {garrisonSids.map((sid, i) => (
                      <li key={i} className="font-mono">{sid}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })()}

          {selected && selected.sid === 'random-squad'
            && (selected.randomSquadValue !== undefined || onSetRandomSquadValue) && (() => {
            const shownValue = draftRandomSquadValue ?? selected.randomSquadValue ?? 0
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.value')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('mapGrid.mapGridCellContent.totalArmyValueTheGame')}
                </p>
                <div className="flex items-center gap-2">
                  {onSetRandomSquadValue ? (
                    <Input
                      type="number"
                      min={0}
                      className="h-6 text-xs w-24"
                      value={shownValue}
                      onChange={(e) => setDraftRandomSquadValue(Math.max(0, Number(e.target.value) || 0))}
                      onBlur={() => {
                        if (draftRandomSquadValue !== null && draftRandomSquadValue !== selected.randomSquadValue) {
                          onSetRandomSquadValue(selected, draftRandomSquadValue)
                        }
                        setDraftRandomSquadValue(null)
                      }}
                    />
                  ) : (
                    <p className="text-xs tabular-nums">{shownValue}</p>
                  )}
                  <Badge variant="outline" className="text-xs">{randomSquadDifficultyLabel(shownValue, squadDifficultyRanges)}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    title={t('mapGrid.mapGridCellContent.showAnExampleSquadFor')}
                    aria-label={t('mapGrid.mapGridCellContent.showAnExampleSquadFor')}
                    onClick={() => setSquadExampleOpen(true)}
                  >
                    <Dices className="h-3.5 w-3.5" />
                  </Button>
                  <RandomSquadExampleDialog
                    open={squadExampleOpen}
                    onOpenChange={setSquadExampleOpen}
                    value={shownValue}
                    fraction={selected.randomSquadFraction ?? ''}
                    catalog={catalog}
                    ranges={squadDifficultyRanges}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('common.statsDialog.faction')}</p>
                  {(() => {
                    const fraction = selected.randomSquadFraction ?? ''
                    const label = (v: string) => (v === '' ? 'Random' : v === 'neutral' ? 'Neutral' : localNameById(catalog, 'factions', v, catalog?.factions.find((f) => f.id === v)?.name ?? v))
                    return onSetRandomSquadFraction ? (
                      <Select value={fraction || 'random'} onValueChange={(v) => onSetRandomSquadFraction(selected, v === 'random' ? '' : v)}>
                        <SelectTrigger className="h-7 text-xs mt-0.5 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="random">{t('common.generateRandomMapDialog.random')}</SelectItem>
                          {(catalog?.factions ?? []).filter((f) => f.id !== 'neutral').map((f) => (<SelectItem key={f.id} value={f.id}>{localName(catalog, 'factions', f)}</SelectItem>))}
                          <SelectItem value="neutral">{t('common.templateDetailsDialog.neutral')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (<p className="text-xs">{label(fraction)}</p>)
                  })()}
                </div>
                {onSetRandomSquadValue && (
                  <div className="flex flex-wrap gap-1">
                    {squadDifficultyRanges.map(({ label, min, max }) => (
                      <Button
                        key={label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onSetRandomSquadValue(selected, randomInRange(min, max))}
                      >
                        {squadDifficultyName(label)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {selected && portalInfo && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.portal')}</p>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t('mapGrid.mapGridCellContent.connectedTo')}</p>
                {connectedPortal ? (
                  <p className="text-xs font-medium">
                    {connectedPortal.entitySid || connectedPortal.displayName || connectedPortal.sid} ({connectedPortal.x}, {connectedPortal.z})
                  </p>
                ) : portalInfo.targetIdx !== undefined ? (
                  <p className="text-xs">{t('mapGrid.mapGridCellContent.portalNotFoundOnThe', { targetIdx: portalInfo.targetIdx })}</p>
                ) : (
                  <p className="text-xs">{t('mapGrid.mapGridCellContent.notConnected')}</p>
                )}
                {(onStartPortalLink || onUnlinkPortal) && (
                  <div className="flex items-center gap-1.5">
                    {onStartPortalLink && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onStartPortalLink(selected)}
                        title={t('mapGrid.mapGridCellContent.thenClickTheOtherPortal')}>
                        <LinkPortal className="h-3.5 w-3.5" />
                        {portalInfo.targetIdx !== undefined ? t('mapGrid.mapGridCellContent.changeLink') : t('mapGrid.mapGridCellContent.linkToPortal')}
                      </Button>
                    )}
                    {onUnlinkPortal && portalInfo.targetIdx !== undefined && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onUnlinkPortal(selected)}
                        title={t('mapGrid.mapGridCellContent.disconnectThisPortalAndThe')}>
                        <UnlinkPortal className="h-3.5 w-3.5" />
                        {t('mapGrid.mapGridCellContent.unlink')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onSetPortalTarget ? (
                  <Checkbox
                    id="mgc-portal-active"
                    checked={portalInfo.isActive}
                    onCheckedChange={(c) => onSetPortalTarget(selected, { isActive: c === true })}
                  />
                ) : (
                  <Checkbox id="mgc-portal-active" checked={portalInfo.isActive} disabled />
                )}
                <Label htmlFor="mgc-portal-active" className="text-xs cursor-pointer">{t('mapGrid.mapGridCellContent.active')}</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('mapGrid.mapGridCellContent.anInactivePortalOnlyReceives')}
              </p>

              <div>
                <p className="text-xs font-medium">{t(`mapGrid.mapGridCellContent.linkKind.${portalInfo.linkKind}.label`)}</p>
                <p className="text-xs text-muted-foreground">{t(`mapGrid.mapGridCellContent.linkKind.${portalInfo.linkKind}.explanation`)}</p>
              </div>

              {portalInfo.targetNode !== undefined && onSetHighlightedNode && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="mgc-portal-highlight"
                    checked={isHighlightingConnected}
                    onCheckedChange={(c) => onSetHighlightedNode(c === true ? portalInfo.targetNode! : null)}
                  />
                  <Label htmlFor="mgc-portal-highlight" className="text-xs cursor-pointer">
                    {t('mapGrid.mapGridCellContent.highlightConnectedPortalOnGrid')}
                  </Label>
                </div>
              )}
            </div>
          )}

          {selected.rewardParams && selected.rewardParams.length > 0 && (() => {
            const rewardValues = selected.rewardParams!
            return (
              <div className="space-y-1 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.rewards')}</p>
                {onSetRewardParams ? (
                  <RewardSlotEditor
                    parameters={rewardValues}
                    onChange={(params) => onSetRewardParams(selected, params)}
                    catalog={catalog}
                  />
                ) : (
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    {rewardValues.map((p, i) => (
                      <li key={i}>{formatRewardParam(p, catalog)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })()}

          {selected.type === 1 && (selected.markerActive !== undefined || selected.markerDeleteAfterTrigger !== undefined) && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.mapGridCellContent.zone')}</p>
              {selected.markerActive !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Switch id="mgc-marker-active" checked={selected.markerActive} disabled={!onSetMarkerState} onCheckedChange={(on) => onSetMarkerState?.(selected, on, selected.markerDeleteAfterTrigger ?? false)} />
                    <Label htmlFor="mgc-marker-active" className="text-xs">{t('mapGrid.mapGridCellContent.active')}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('mapGrid.mapGridCellContent.theOfficialEditorsOwnActivate')}
                  </p>
                </div>
              )}
              {selected.markerDeleteAfterTrigger !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Switch id="mgc-marker-delete" checked={selected.markerDeleteAfterTrigger} disabled={!onSetMarkerState} onCheckedChange={(on) => onSetMarkerState?.(selected, selected.markerActive ?? true, on)} />
                    <Label htmlFor="mgc-marker-delete" className="text-xs">{t('mapGrid.mapGridCellContent.deleteAfterTrigger')}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('mapGrid.mapGridCellContent.whetherThisZoneRemovesItself')}
                  </p>
                </div>
              )}
            </div>
          )}

          {(selected.type === 0 || selected.type === 1) && (onSetObjectActions || selected.actionsBefore || selected.actionsAfter) && (
            <>
              <ObjectActionsEditor
                key={`${selected.key}-before`}
                title={selected.type === 1 ? t('mapGrid.mapGridCellContent.actionsWhenAHeroEnters') : t('mapGrid.mapGridCellContent.actionsBeforeTheInteraction')}
                hint={
                  selected.type === 1
                    ? t('mapGrid.mapGridCellContent.runWhenAHeroSteps')
                    : t('mapGrid.mapGridCellContent.runWhenAHeroInteracts')
                }
                value={selected.actionsBefore}
                playersCount={playersCount ?? 0}
                onApply={onSetObjectActions ? (v) => onSetObjectActions(selected, 'before', v) : undefined}
              />
              {(selected.type === 0 || selected.actionsAfter) && (
                <ObjectActionsEditor
                  key={`${selected.key}-after`}
                  title={t('mapGrid.mapGridCellContent.actionsAfterTheInteraction')}
                  hint={t('mapGrid.mapGridCellContent.runAfterTheObjectsOwn')}
                  value={selected.actionsAfter}
                  playersCount={playersCount ?? 0}
                  onApply={onSetObjectActions ? (v) => onSetObjectActions(selected, 'after', v) : undefined}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
