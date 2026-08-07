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
import type { PlacedObject, MapEntity } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { PenLine, Tag } from 'lucide-react'

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

export interface MapGridCellContentProps {
  items: PlacedObject[]
  /** "Dirt - Tile (6, 8)"-style label — see terrain-colors.ts's terrainLabel(). */
  terrainLabel: string
  catalog: GameCatalog | null
  /** Present only in the docked (interactive) instance — omit for the read-only undocked mirror. */
  onRename?: (entity: MapEntity) => void
  onSetDisplayName?: (entity: MapEntity) => void
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
}

const PLAYER_TYPE_LABELS = ['Player', 'Bot', 'Unknown'] as const

export default function MapGridCellContent({
  items,
  terrainLabel,
  catalog,
  onRename,
  onSetDisplayName,
  onSetNoCombineGeometry,
  onAssignEntitySid,
  existingSids = [],
  onSetSpawnerPlayerType,
}: MapGridCellContentProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(items[0]?.key ?? null)
  const [newSidInput, setNewSidInput] = useState('')

  // A newly-clicked tile arrives as a new `items` array — default back to
  // the first row rather than keeping a stale selection from the old tile.
  useEffect(() => {
    setSelectedKey(items[0]?.key ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const selected = items.find((i) => i.key === selectedKey) ?? items[0] ?? null
  const selectedEntity = selected ? toEntity(selected) : null

  useEffect(() => { setNewSidInput('') }, [selected?.key])

  const catalogEntry = catalog?.mapObjects.find((o) => o.id === selected?.sid)
  const canToggleNoCombine = !!selected && !!catalogEntry && !catalogEntry.isInteractable
  const trimmedSid = newSidInput.trim()
  const sidTaken = trimmedSid !== '' && existingSids.includes(trimmedSid)

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
              <CatalogIcon iconId={item.sid} name={name} size={24} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {group ? GRID_GROUP_LABELS[group] : item.type === 1 ? 'Zone marker' : item.sid}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="border-t border-border shrink-0 p-3 space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Object SID</p>
            <p className="font-mono text-xs truncate">{selected.sid}</p>
          </div>
          {selected.entitySid && (
            <div>
              <p className="text-xs text-muted-foreground">Entity SID</p>
              <p className="font-mono text-xs truncate">{selected.entitySid}</p>
            </div>
          )}
          {selected.displayName && (
            <div>
              <p className="text-xs text-muted-foreground">Display name</p>
              <p className="text-xs truncate">{selected.displayName}</p>
            </div>
          )}
          {selectedEntity && (onRename || onSetDisplayName) && (
            <div className="flex items-center gap-2 pt-1">
              {onRename && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onRename(selectedEntity)}>
                  <PenLine className="h-3 w-3" />
                  Rename SID
                </Button>
              )}
              {onSetDisplayName && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => onSetDisplayName(selectedEntity)}>
                  <Tag className="h-3 w-3" />
                  Set display name
                </Button>
              )}
            </div>
          )}

          {selected && canToggleNoCombine && onSetNoCombineGeometry && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="mgc-no-combine"
                checked={selected.noCombineGeometry ?? false}
                onCheckedChange={(c) => onSetNoCombineGeometry(selected, c === true)}
              />
              <Label htmlFor="mgc-no-combine" className="text-xs cursor-pointer">
                No Combine Geometry
              </Label>
            </div>
          )}

          {selected && selected.noCombineGeometry && !selected.entitySid && onAssignEntitySid && (
            <div className="space-y-1 pt-1">
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

          {selected.spawnerInfo && (
            <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground">Spawner</p>
              <div>
                <p className="text-xs text-muted-foreground">
                  {selected.spawnerInfo.spawnPointType === 0 ? 'Faction' : 'Hero'}
                </p>
                <p className="text-xs">
                  {(selected.spawnerInfo.spawnPointType === 0 ? selected.spawnerInfo.factionSid : selected.spawnerInfo.heroSid)
                    || 'Random'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Spawner type</p>
                <p className="text-xs">{selected.spawnerInfo.spawnPointType === 0 ? 'City' : 'Hero'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Player attached to this spawner</p>
                <p className="text-xs">Player {selected.spawnerInfo.owner}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Player type</p>
                {onSetSpawnerPlayerType ? (
                  <div className="flex gap-1">
                    {PLAYER_TYPE_LABELS.map((label, idx) => (
                      <button
                        key={label}
                        onClick={() => onSetSpawnerPlayerType(selected, idx as 0 | 1 | 2)}
                        className={cn(
                          'h-6 px-2 text-xs rounded border transition-colors',
                          selected.spawnerInfo!.spawnType === idx
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
