// ─── Map Grid — cell-info column content (issue #125) ───────────────────────
// Props-driven, no direct store reads — rendered both by the docked column
// inside MapGridDialog.tsx (interactive: real Rename/Set-display-name
// actions) and by PanelContent.tsx for the undocked cross-window mirror
// (read-only: onRename/onSetDisplayName simply omitted), same convention as
// QuestFlowContent/TimelineContent (src/components/panels/PanelContent.tsx).
//
// Master-detail layout per issue #125 item 3: a clickable row per item on
// the tile, and a detail panel below for whichever row is selected.

import { useEffect, useState } from 'react'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { groupOf, GRID_GROUP_LABELS } from '@/lib/map-grid/tile-index'
import { resolveGridCellVisual } from '@/lib/map-grid/cell-visual'
import { formatRewardParam } from '@/lib/map-grid/reward-params'
import type { PlacedObject, MapEntity } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, PenLine, Tag, UserCog } from 'lucide-react'
import HeroCatalogListEditor from '@/components/tree/HeroCatalogListEditor'
import HeroPickerDialog from '@/components/catalog/HeroPickerDialog'
import RewardSlotEditor from '@/components/tree/RewardSlotEditor'

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
  /** Every portal instance on the map, for the target picker (issue #127 item 8). */
  allPortals?: PlacedObject[]
  /** Change which portal this one connects to, and/or its active state — docked-only. */
  onSetPortalTarget?: (item: PlacedObject, patch: { targetIdx?: number; isActive?: boolean }) => void
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
  /** Set every reward slot's value at once (issue #143) — docked-only, like the above. */
  onSetRewardParams?: (item: PlacedObject, parameters: string[]) => void
  /** The parent's active move, if any (issue #167 Phase A) — only relevant
   *  when `key` matches `selected.key`, compared locally below since the
   *  parent doesn't know which stacked item this panel currently shows. */
  moveTarget?: { key: string; x: number; z: number } | null
  /** Start moving `item` — enters "pick a destination" mode on the grid
   *  (click a tile, or use arrow keys) until Save/Cancel. Docked-only. */
  onStartMove?: (item: PlacedObject) => void
  /** Write the staged destination to the .map file. Docked-only. */
  onSaveMove?: () => void
  /** Discard the staged destination without writing anything. Docked-only. */
  onCancelMove?: () => void
  /** The parent's staged rotation, if any — only `type === 0` instances
   *  ever have one (only `objects[]` carries a rotations[] array). Same
   *  "compared locally against selected.key" convention as moveTarget. */
  rotateTarget?: { key: string; rotation: number } | null
  /** Step `item`'s rotation by one quadrant in either direction — starts
   *  staging from its current rotation if nothing is staged yet. Nothing is
   *  written until Save. Docked-only. */
  onStepRotate?: (item: PlacedObject, delta: 1 | -1) => void
  /** Write the staged rotation to the .map file. Docked-only. */
  onSaveRotate?: () => void
  /** Discard the staged rotation without writing anything. Docked-only. */
  onCancelRotate?: () => void
  /** The parent's active delete confirmation, if any (issue #167 Phase C) —
   *  same "compared locally against selected.key" convention as moveTarget. */
  deleteTarget?: { key: string } | null
  /** "trigger [0,1,2]"/"dialog [id, slideId]"-style descriptions of every
   *  place the target's entitySid is referenced — computed by the parent via
   *  entity-usage.ts, shown so deleting doesn't silently orphan a reference. */
  deleteUsageWarnings?: string[]
  /** Stage a delete confirmation for `item` — nothing is written until
   *  Save. Docked-only. */
  onStartDelete?: (item: PlacedObject) => void
  /** Write the delete to the .map file. Docked-only. */
  onSaveDelete?: () => void
  /** Discard the staged delete without writing anything. Docked-only. */
  onCancelDelete?: () => void
}

const LINK_KIND_LABELS: Record<'two-way' | 'one-way' | 'unlinked', string> = {
  'two-way': 'Two-way',
  'one-way': 'One-way (exit only on the other end)',
  unlinked: 'Not connected',
}

const LINK_KIND_EXPLANATIONS: Record<'two-way' | 'one-way' | 'unlinked', string> = {
  'two-way': 'Stepping on either portal sends you to the other.',
  'one-way': "This portal sends you to the other one, but stepping on that one won't send you back — it only receives (the official editor calls a disabled portal like this an \"exit portal\").",
  unlinked: "This portal isn't connected to another one, so stepping on it does nothing.",
}

const PLAYER_TYPE_LABELS = ['Player', 'Bot', 'Unknown'] as const

/** `rotation` is a 0-3 quadrant enum (0/90/180/270°) with a `+10` offset for
 *  a mirrored variant (10-13) — confirmed against every real sample map's
 *  rotations[] values (only {0,1,2,3,10,11,12,13} ever occur). */
function formatRotation(rotation: number): string {
  const degrees = (rotation % 10) * 90
  return rotation >= 10 ? `${degrees}° (mirrored)` : `${degrees}°`
}

/** Labels match the game's own scenario-difficulty naming (Easy/Normal/
 *  Difficult/Impossible/Lethal — see plans/mapmaking_guide_en_noMapEditor.md's
 *  Difficulty condition docs) applied to a random-squad's requestedValue. */
function randomSquadDifficultyLabel(value: number): string {
  if (value <= 2000) return 'Easy'
  if (value <= 4000) return 'Normal'
  if (value <= 6000) return 'Difficult'
  if (value <= 8000) return 'Impossible'
  return 'Lethal'
}

/** Ranges for the difficulty quick-pick buttons next to the Value field —
 *  same bucket boundaries as randomSquadDifficultyLabel above. Floors at
 *  250, not 0 — requestedValue:0 makes a random-squad invisible in-game
 *  (see randomSquadDefaultValue's doc comment in map-write.ts). Lethal has
 *  no documented real ceiling above 8000; 16000 is just a reasonable cap
 *  for this convenience roll. */
const RANDOM_SQUAD_DIFFICULTY_RANGES: { label: string; min: number; max: number }[] = [
  { label: 'Easy', min: 250, max: 2000 },
  { label: 'Normal', min: 2001, max: 4000 },
  { label: 'Difficult', min: 4001, max: 6000 },
  { label: 'Impossible', min: 6001, max: 8000 },
  { label: 'Lethal', min: 8001, max: 16000 },
]

function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
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
  allPortals = [],
  onSetPortalTarget,
  highlightedNode = null,
  onSetHighlightedNode,
  onSetGuardSquad,
  onSetCityGarrison,
  onSetRandomSquadValue,
  onSetRewardParams,
  moveTarget = null,
  onStartMove,
  onSaveMove,
  onCancelMove,
  rotateTarget = null,
  onStepRotate,
  onSaveRotate,
  onCancelRotate,
  deleteTarget = null,
  deleteUsageWarnings = [],
  onStartDelete,
  onSaveDelete,
  onCancelDelete,
}: MapGridCellContentProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(items[0]?.key ?? null)
  const [newSidInput, setNewSidInput] = useState('')
  // issue #130 item 9: Player type used to save on every click — now staged
  // locally and only written on an explicit Save, matching the entity-SID/
  // display-name convention (both of those already require a deliberate
  // action, not a click-and-forget one).
  const [pendingSpawnType, setPendingSpawnType] = useState<0 | 1 | 2 | null>(null)
  const [pendingSpawnerOwner, setPendingSpawnerOwner] = useState<number | null>(null)
  const [pendingCityFaction, setPendingCityFaction] = useState<string | null>(null)
  const [pendingSpawnHero, setPendingSpawnHero] = useState<boolean | null>(null)
  const [pendingHeroSid, setPendingHeroSid] = useState<string | null>(null)
  // Hero-spawner only, local-only (never written) — just narrows the hero
  // browser below, since a hero-spawner has no propCities row to persist a
  // faction to; the faction becomes implicit once a specific hero is picked.
  const [heroFactionFilter, setHeroFactionFilter] = useState<string>('')
  const [heroPickerOpen, setHeroPickerOpen] = useState(false)
  // issue #143 — same staged-then-saved convention as Player type above.
  const [pendingGuardUnitProps, setPendingGuardUnitProps] = useState<{ sid: string; count: number }[] | null>(null)
  const [pendingCitySquadSids, setPendingCitySquadSids] = useState<string[] | null>(null)
  const [pendingRandomSquadValue, setPendingRandomSquadValue] = useState<number | null>(null)
  const [pendingRewardParams, setPendingRewardParams] = useState<string[] | null>(null)

  // A newly-clicked tile arrives as a new `items` array — default back to
  // the first row rather than keeping a stale selection from the old tile.
  useEffect(() => {
    setSelectedKey(items[0]?.key ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const selected = items.find((i) => i.key === selectedKey) ?? items[0] ?? null
  const renameEntity = selected ? toEntity(selected) : null

  useEffect(() => { setNewSidInput('') }, [selected?.key])
  useEffect(() => { setPendingSpawnType(null) }, [selected?.key])
  useEffect(() => { setPendingSpawnerOwner(null) }, [selected?.key])
  useEffect(() => {
    setPendingCityFaction(null)
    setPendingSpawnHero(null)
    setPendingHeroSid(null)
    setHeroFactionFilter('')
  }, [selected?.key])
  useEffect(() => { setPendingGuardUnitProps(null) }, [selected?.key])
  useEffect(() => { setPendingCitySquadSids(null) }, [selected?.key])
  useEffect(() => { setPendingRandomSquadValue(null) }, [selected?.key])
  useEffect(() => { setPendingRewardParams(null) }, [selected?.key])

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

  const portalInfo = selected?.portalInfo
  const connectedPortal = portalInfo?.targetNode !== undefined
    ? allPortals.find((p) => p.node === portalInfo.targetNode)
    : undefined
  const isHighlightingConnected = portalInfo?.targetNode !== undefined && highlightedNode === portalInfo.targetNode

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <p className="text-sm font-semibold">{terrainLabel}</p>
        <p className="text-xs text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Nothing on this tile.</p>
        )}
        {items.map((item) => {
          const group = groupOf(item, catalog)
          const name = item.displayName || item.entitySid || item.sid
          const isSelected = item.key === selected?.key
          return (
            <button
              key={item.key}
              onClick={() => setSelectedKey(item.key)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/50 transition-colors',
                isSelected ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              {(() => {
                const visual = resolveGridCellVisual(item, catalog)
                if (visual.kind === 'icon') return <visual.Icon size={24} className="shrink-0" />
                if (visual.kind === 'text') return <span className="text-[10px] font-semibold shrink-0 w-6 text-center">{visual.text}</span>
                if (visual.kind === 'catalogOverride') return <CatalogIcon iconId={visual.iconId} name={visual.name} size={24} />
                return <CatalogIcon iconId={item.sid} name={name} size={24} />
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {group ? GRID_GROUP_LABELS[group] : item.sid}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="border-t border-border shrink-0 max-h-[55%] overflow-y-auto p-3 space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Object SID</p>
            <p className="font-mono text-xs truncate">{selected.sid}</p>
          </div>

          {(() => {
            const isMoving = moveTarget?.key === selected.key
            const isDirty = isMoving && (moveTarget!.x !== selected.x || moveTarget!.z !== selected.z)
            return (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Position</p>
                {isMoving ? (
                  <div className="space-y-1.5">
                    <p className="text-xs">
                      {isDirty ? `Moving to (${moveTarget!.x}, ${moveTarget!.z})` : `(${selected.x}, ${selected.z})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Click a tile on the grid, or use the arrow keys, to choose a destination.
                    </p>
                    <div className="flex items-center gap-2">
                      {isDirty && (
                        <>
                          <p className="text-xs text-amber-600">Unsaved change</p>
                          <Button size="sm" className="h-6 text-xs" onClick={onSaveMove}>
                            Save to .map
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancelMove}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xs">({selected.x}, {selected.z})</p>
                    {onStartMove && (
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => onStartMove(selected)}>
                        Move
                      </Button>
                    )}
                    {onStartDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs text-destructive hover:text-destructive"
                        onClick={() => onStartDelete(selected)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {selected.type === 0 && selected.rotation !== undefined && (() => {
            const isRotating = rotateTarget?.key === selected.key
            const shown = isRotating ? rotateTarget!.rotation : selected.rotation!
            const isDirty = isRotating && rotateTarget!.rotation !== selected.rotation
            return (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Rotation</p>
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
                  <p className="text-xs w-24">{formatRotation(shown)}</p>
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
                  {isDirty && (
                    <>
                      <p className="text-xs text-amber-600">Unsaved</p>
                      <Button size="sm" className="h-6 text-xs" onClick={onSaveRotate}>
                        Save to .map
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancelRotate}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })()}

          {deleteTarget?.key === selected.key && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="text-xs font-semibold text-destructive">Delete this object?</p>
              <p className="text-xs text-muted-foreground">
                This removes it (and every property table row it has) from the .map file. There is no
                undo in this app beyond the one-time .bak backup made on your next save.
              </p>
              {deleteUsageWarnings.length > 0 && (
                <div className="space-y-1 rounded bg-amber-500/10 p-1.5">
                  <p className="text-xs font-medium text-amber-600">
                    Referenced by {deleteUsageWarnings.length} script location{deleteUsageWarnings.length > 1 ? 's' : ''} —
                    deleting will leave those references dangling:
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                    {deleteUsageWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={onSaveDelete}>
                  Delete and save to .map
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onCancelDelete}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {selected.isActive === false && (
            <Badge variant="secondary" className="text-amber-500 text-xs">
              Inactive at start
            </Badge>
          )}
          {selected.owner !== undefined && (
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="text-xs">{selected.owner === -1 ? 'Neutral' : `Player ${selected.owner}`}</p>
            </div>
          )}
          {selected.entitySid && (
            <div>
              <p className="text-xs text-muted-foreground">Entity SID</p>
              <p className="font-mono text-xs truncate">{selected.entitySid}</p>
            </div>
          )}
          {selected.displayName && (
            <div>
              <p className="text-xs text-muted-foreground">
                {isCitySpawner ? 'City name' : 'Display name'}
              </p>
              <p className="text-xs truncate">{selected.displayName}</p>
            </div>
          )}
          {selected && canManageEntity && renameEntity && onRename && (
            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onRename(renameEntity)}>
                <PenLine className="h-3 w-3" />
                Rename SID
              </Button>
              {onSetDisplayName && !isHeroSpawner && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSetDisplayName(toDisplayNameEntity(selected))}>
                  <Tag className="h-3 w-3" />
                  {isCitySpawner ? 'Set city name' : 'Set display name'}
                </Button>
              )}
              {isHeroSpawner && onEditFullHero && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onEditFullHero(toDisplayNameEntity(selected))}>
                  <UserCog className="h-3 w-3" />
                  Edit full hero
                </Button>
              )}
            </div>
          )}

          {selected && canManageEntity && !selected.entitySid && (
            <div className="space-y-2 pt-1">
              {onAssignEntitySid && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Assign entity SID</p>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={newSidInput}
                      onChange={(e) => setNewSidInput(e.target.value)}
                      className="h-7 text-xs font-mono"
                      placeholder="entity_sid"
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      disabled={!trimmedSid || sidTaken}
                      onClick={() => { onAssignEntitySid(selected, trimmedSid); setNewSidInput('') }}
                    >
                      Assign
                    </Button>
                  </div>
                  {sidTaken && <p className="text-xs text-destructive">Another entity already uses this SID.</p>}
                </div>
              )}
              {onSetDisplayName && !isHeroSpawner && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSetDisplayName(toDisplayNameEntity(selected))}>
                  <Tag className="h-3 w-3" />
                  {isCitySpawner ? 'Set city name' : 'Set display name'}
                </Button>
              )}
              {isHeroSpawner && onEditFullHero && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onEditFullHero(toDisplayNameEntity(selected))}>
                  <UserCog className="h-3 w-3" />
                  Edit full hero
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
                  No Combine Geometry
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Lets this decoration carry an entity SID so it can be referenced in quest
                scripting, the same as an interactable object — off by default since most
                decorations aren't meant to be scripted.
              </p>
            </div>
          )}

          {selected
            && (selected.type === 0 ? !selected.isCity && !isHeroSpawner : selected.type === 2)
            && (selected.guardUnitProps !== undefined || onSetGuardSquad) && (() => {
              const guardRows = pendingGuardUnitProps ?? selected.guardUnitProps ?? []
              const guardDirty = pendingGuardUnitProps !== null
                && JSON.stringify(pendingGuardUnitProps) !== JSON.stringify(selected.guardUnitProps ?? [])
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
                      onChange={setPendingGuardUnitProps}
                      maxRows={12}
                      refField="sid"
                      emptyRow={{ sid: '', count: 1 }}
                      addLabel="Add unit"
                      renderExtraFields={(row, _i, update) => (
                        <Input
                          type="number"
                          value={row.count}
                          onChange={(e) => update({ count: Number(e.target.value) || 1 })}
                          className="h-8 w-16 text-xs"
                          title="Count"
                        />
                      )}
                    />
                  ) : (
                    <ul className="text-xs list-disc list-inside space-y-0.5">
                      {guardRows.map((u, i) => (
                        <li key={i}>{catalog?.creatures.find((c) => c.id === u.sid)?.name ?? u.sid} x{u.count}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selected.type === 2
                      ? 'Leave empty for a randomized count/creature, resolved by the game itself — setting an exact unit here overrides that.'
                      : 'Confirmed on interactable objects in real shipped maps; never observed on a mine specifically, though nothing here prevents setting one.'}
                  </p>
                  {onSetGuardSquad && guardDirty && (
                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-xs text-amber-600">Unsaved change</p>
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => { onSetGuardSquad(selected, pendingGuardUnitProps!); setPendingGuardUnitProps(null) }}
                      >
                        Save to .map
                      </Button>
                    </div>
                  )}
                </div>
              )
            })()}

          {selected.spawnerInfo && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">Spawner</p>
              {(() => {
                const info = selected.spawnerInfo!
                const isCitySpawnerHere = info.spawnPointType === 0
                const currentFactionSid = isCitySpawnerHere ? (info.factionSid ?? '') : heroFactionFilter
                const shownFactionSid = isCitySpawnerHere ? (pendingCityFaction ?? currentFactionSid) : currentFactionSid
                const factionDirty = isCitySpawnerHere && pendingCityFaction !== null && pendingCityFaction !== currentFactionSid
                const currentSpawnHero = info.spawnHero ?? false
                const shownSpawnHero = pendingSpawnHero ?? currentSpawnHero
                const spawnHeroDirty = pendingSpawnHero !== null && pendingSpawnHero !== currentSpawnHero
                const currentHeroSid = info.heroSid ?? 'random'
                const shownHeroSid = pendingHeroSid ?? currentHeroSid
                const heroDirty = pendingHeroSid !== null && pendingHeroSid !== currentHeroSid
                const factionName = (sid: string) => {
                  const name = catalog?.factions.find((f) => f.id === sid)?.name
                  return name ? `${name} (${sid})` : sid
                }
                const canEditFaction = isCitySpawnerHere ? !!onSetCityFaction : !!onSetHeroSid
                return (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Faction</p>
                      {canEditFaction ? (
                        <Select
                          value={shownFactionSid || 'random'}
                          onValueChange={(v) => {
                            const sid = v === 'random' ? '' : v
                            if (isCitySpawnerHere) setPendingCityFaction(sid)
                            else setHeroFactionFilter(sid)
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs mt-0.5 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random">Random</SelectItem>
                            {(catalog?.factions ?? []).map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs">{shownFactionSid ? factionName(shownFactionSid) : 'Random'}</p>
                      )}
                      {factionDirty && (
                        <div className="flex items-center gap-2 pt-1">
                          <p className="text-xs text-amber-600">Unsaved change</p>
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => { onSetCityFaction!(selected, pendingCityFaction!); setPendingCityFaction(null) }}
                          >
                            Save to .map
                          </Button>
                        </div>
                      )}
                    </div>

                    {isCitySpawnerHere && (
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 text-xs">
                          {onSetCitySpawnHero ? (
                            <Checkbox
                              checked={shownSpawnHero}
                              onCheckedChange={(v) => setPendingSpawnHero(v === true)}
                            />
                          ) : (
                            <Checkbox checked={shownSpawnHero} disabled />
                          )}
                          Spawns with a hero
                        </label>
                        {shownSpawnHero && <p className="text-xs text-muted-foreground pl-6">Random hero</p>}
                        {spawnHeroDirty && (
                          <div className="flex items-center gap-2 pt-1">
                            <p className="text-xs text-amber-600">Unsaved change</p>
                            <Button
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => { onSetCitySpawnHero!(selected, pendingSpawnHero!); setPendingSpawnHero(null) }}
                            >
                              Save to .map
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {!isCitySpawnerHere && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Hero</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs">{shownHeroSid === 'random' ? 'Random' : shownHeroSid}</p>
                          {onSetHeroSid && (
                            <>
                              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setHeroPickerOpen(true)}>
                                Browse…
                              </Button>
                              {shownHeroSid !== 'random' && (
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPendingHeroSid('random')}>
                                  Set to random
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        {heroDirty && (
                          <div className="flex items-center gap-2 pt-1">
                            <p className="text-xs text-amber-600">Unsaved change</p>
                            <Button
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => { onSetHeroSid!(selected, pendingHeroSid!); setPendingHeroSid(null) }}
                            >
                              Save to .map
                            </Button>
                          </div>
                        )}
                        {onSetHeroSid && (
                          <HeroPickerDialog
                            open={heroPickerOpen}
                            onOpenChange={setHeroPickerOpen}
                            value={shownHeroSid !== 'random' ? shownHeroSid : undefined}
                            lockedFaction={heroFactionFilter || undefined}
                            onSelect={(entry) => { if (entry.heroId) setPendingHeroSid(entry.heroId) }}
                          />
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
              {isCitySpawner && (
                <div>
                  <p className="text-xs text-muted-foreground">Spawner type</p>
                  <p className="text-xs">City</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Player attached to this spawner</p>
                {onSetSpawnerOwner && playersCount > 0 ? (
                  <>
                    <Select
                      value={String(pendingSpawnerOwner ?? selected.spawnerInfo.owner)}
                      onValueChange={(v) => setPendingSpawnerOwner(Number(v))}
                    >
                      <SelectTrigger className="h-7 text-xs mt-0.5 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: playersCount }, (_, i) => i + 1).map((p) => (
                          <SelectItem key={p} value={String(p)}>Player {p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pendingSpawnerOwner !== null && pendingSpawnerOwner !== selected.spawnerInfo.owner && (
                      <div className="flex items-center gap-2 pt-1">
                        <p className="text-xs text-amber-600">Unsaved change</p>
                        <Button
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => { onSetSpawnerOwner(selected, pendingSpawnerOwner); setPendingSpawnerOwner(null) }}
                        >
                          Save to .map
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs">Player {selected.spawnerInfo.owner}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Player type</p>
                {onSetSpawnerPlayerType ? (
                  <div className="flex gap-1">
                    {PLAYER_TYPE_LABELS.map((label, idx) => (
                      <button
                        key={label}
                        onClick={() => setPendingSpawnType(idx as 0 | 1 | 2)}
                        className={cn(
                          'h-6 px-2 text-xs rounded border transition-colors',
                          (pendingSpawnType ?? selected.spawnerInfo!.spawnType) === idx
                            ? 'bg-background text-foreground border-border'
                            : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs">{PLAYER_TYPE_LABELS[selected.spawnerInfo.spawnType] ?? 'Unknown'}</p>
                )}
                {onSetSpawnerPlayerType && pendingSpawnType !== null && pendingSpawnType !== selected.spawnerInfo.spawnType && (
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-amber-600">Unsaved change</p>
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { onSetSpawnerPlayerType(selected, pendingSpawnType); setPendingSpawnType(null) }}
                    >
                      Save to .map
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {selected && selected.isCity && (selected.citySquadSids !== undefined || onSetCityGarrison) && (() => {
            const garrisonSids = pendingCitySquadSids ?? selected.citySquadSids ?? []
            const garrisonRows = garrisonSids.map((sid) => ({ sid }))
            const garrisonDirty = pendingCitySquadSids !== null
              && JSON.stringify(pendingCitySquadSids) !== JSON.stringify(selected.citySquadSids ?? [])
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">Garrison</p>
                <p className="text-xs text-muted-foreground">
                  Squad templates this city starts with — each references a pre-built
                  squad (Core/DB/squads), not an individual unit.
                </p>
                {onSetCityGarrison ? (
                  <HeroCatalogListEditor
                    category="squadTemplate"
                    rows={garrisonRows}
                    onChange={(rows) => setPendingCitySquadSids(rows.map((r) => r.sid))}
                    maxRows={5}
                    refField="sid"
                    emptyRow={{ sid: '' }}
                    addLabel="Add squad"
                    renderExtraFields={() => null}
                  />
                ) : (
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    {garrisonSids.map((sid, i) => (
                      <li key={i} className="font-mono">{sid}</li>
                    ))}
                  </ul>
                )}
                {onSetCityGarrison && garrisonDirty && (
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-amber-600">Unsaved change</p>
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { onSetCityGarrison(selected, pendingCitySquadSids!); setPendingCitySquadSids(null) }}
                    >
                      Save to .map
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}

          {selected && selected.sid === 'random-squad'
            && (selected.randomSquadValue !== undefined || onSetRandomSquadValue) && (() => {
            const shownValue = pendingRandomSquadValue ?? selected.randomSquadValue ?? 0
            const valueDirty = pendingRandomSquadValue !== null && pendingRandomSquadValue !== selected.randomSquadValue
            return (
              <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">Value</p>
                <p className="text-xs text-muted-foreground">
                  Total army value the game rolls a matching squad against.
                </p>
                <div className="flex items-center gap-2">
                  {onSetRandomSquadValue ? (
                    <Input
                      type="number"
                      min={0}
                      className="h-6 text-xs w-24"
                      value={shownValue}
                      onChange={(e) => setPendingRandomSquadValue(Math.max(0, Number(e.target.value) || 0))}
                    />
                  ) : (
                    <p className="text-xs tabular-nums">{shownValue}</p>
                  )}
                  <Badge variant="outline" className="text-xs">{randomSquadDifficultyLabel(shownValue)}</Badge>
                </div>
                {onSetRandomSquadValue && (
                  <div className="flex flex-wrap gap-1">
                    {RANDOM_SQUAD_DIFFICULTY_RANGES.map(({ label, min, max }) => (
                      <Button
                        key={label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setPendingRandomSquadValue(randomInRange(min, max))}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
                {onSetRandomSquadValue && valueDirty && (
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-amber-600">Unsaved change</p>
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { onSetRandomSquadValue(selected, pendingRandomSquadValue!); setPendingRandomSquadValue(null) }}
                    >
                      Save to .map
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}

          {selected && portalInfo && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">Portal</p>

              <div>
                <p className="text-xs text-muted-foreground">Connected to</p>
                {onSetPortalTarget ? (
                  <Select
                    value={portalInfo.targetIdx !== undefined ? String(portalInfo.targetIdx) : 'none'}
                    onValueChange={(v) => onSetPortalTarget(selected, { targetIdx: v === 'none' ? -1 : Number(v) })}
                  >
                    <SelectTrigger className="h-7 text-xs mt-0.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not connected</SelectItem>
                      {allPortals.filter((p) => p.key !== selected.key).map((p) => (
                        <SelectItem key={p.key} value={String(p.id)}>
                          {p.sid} ({p.x}, {p.z})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs">
                    {connectedPortal ? `${connectedPortal.sid} (${connectedPortal.x}, ${connectedPortal.z})` : 'Not connected'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Changing this only affects this portal — edit the other one too if you want a two-way link.
                </p>
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
                <Label htmlFor="mgc-portal-active" className="text-xs cursor-pointer">Active</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                An inactive portal only receives — stepping on it won't send you anywhere (an "exit portal").
              </p>

              <div>
                <p className="text-xs font-medium">{LINK_KIND_LABELS[portalInfo.linkKind]}</p>
                <p className="text-xs text-muted-foreground">{LINK_KIND_EXPLANATIONS[portalInfo.linkKind]}</p>
              </div>

              {portalInfo.targetNode !== undefined && onSetHighlightedNode && (
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="mgc-portal-highlight"
                    checked={isHighlightingConnected}
                    onCheckedChange={(c) => onSetHighlightedNode(c === true ? portalInfo.targetNode! : null)}
                  />
                  <Label htmlFor="mgc-portal-highlight" className="text-xs cursor-pointer">
                    Highlight connected portal on grid
                  </Label>
                </div>
              )}
            </div>
          )}

          {selected.rewardParams && selected.rewardParams.length > 0 && (() => {
            const rewardValues = pendingRewardParams ?? selected.rewardParams!
            const rewardDirty = pendingRewardParams !== null
              && JSON.stringify(pendingRewardParams) !== JSON.stringify(selected.rewardParams)
            return (
              <div className="space-y-1 pt-2 mt-1 border-t border-border/50">
                <p className="text-xs font-semibold text-muted-foreground">Rewards</p>
                {onSetRewardParams ? (
                  <RewardSlotEditor parameters={rewardValues} onChange={setPendingRewardParams} catalog={catalog} />
                ) : (
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    {rewardValues.map((p, i) => (
                      <li key={i}>{formatRewardParam(p, catalog)}</li>
                    ))}
                  </ul>
                )}
                {onSetRewardParams && rewardDirty && (
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-amber-600">Unsaved change</p>
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { onSetRewardParams(selected, pendingRewardParams!); setPendingRewardParams(null) }}
                    >
                      Save to .map
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}

          {selected.type === 1 && (selected.markerActive !== undefined || selected.markerDeleteAfterTrigger !== undefined) && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">Zone</p>
              {selected.markerActive !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Switch id="mgc-marker-active" checked={selected.markerActive} disabled />
                    <Label htmlFor="mgc-marker-active" className="text-xs">Active</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The official editor's own "Activate" checkbox. When off, this zone
                    doesn't interrupt hero movement or fire its actions at all — it can be
                    turned back on later via the SetActiveMarker script action.
                  </p>
                </div>
              )}
              {selected.markerDeleteAfterTrigger !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Switch id="mgc-marker-delete" checked={selected.markerDeleteAfterTrigger} disabled />
                    <Label htmlFor="mgc-marker-delete" className="text-xs">Delete after trigger</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Whether this zone removes itself automatically the first time it
                    fires. When off, the zone remains on the map and can fire again.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
