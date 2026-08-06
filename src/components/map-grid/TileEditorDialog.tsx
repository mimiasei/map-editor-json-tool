// ─── Map Grid — tile editor dialog (issue #122 Phase 2) ─────────────────────
// Opened by clicking an occupied grid cell. Lists every PlacedObject on that
// tile; items that already carry an entity SID (objectsProperties.propEntities)
// get Rename/Set-display-name actions that reuse the existing issue-120 write
// path — same scope as everywhere else in this editor (SID + display name,
// not a general property editor), just reached from a new entry point.

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { groupOf, GRID_GROUP_LABELS } from '@/lib/map-grid/tile-index'
import { buildEntityUsageMap, describeEntityUsage } from '@/lib/entity-usage'
import { isTauri } from '@/lib/native-fs'
import RenameEntitySidDialog from '@/components/tree/RenameEntitySidDialog'
import SetDisplayNameDialog from '@/components/tree/SetDisplayNameDialog'
import type { PlacedObject, MapEntity } from '@/types/map-context'
import { PenLine, Tag } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PlacedObject[]
  x: number
  z: number
}

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

export default function TileEditorDialog({ open, onOpenChange, items, x, z }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const scenario = useScenarioStore((s) => s.scenario)
  const mapFilePath = useScenarioStore((s) => s.mapFilePath)
  const entities = useMapContextStore((s) => s.context?.entities) ?? []

  const entityUsageListMap = useMemo(() => buildEntityUsageMap(scenario), [scenario])
  const existingSids = useMemo(() => entities.map((e) => e.sid), [entities])

  const [renameTarget, setRenameTarget] = useState<MapEntity | null>(null)
  const [displayNameTarget, setDisplayNameTarget] = useState<MapEntity | null>(null)

  const canEdit = isTauri() && !!mapFilePath

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Tile ({x}, {z}) — {items.length} item{items.length !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing on this tile.</p>
            )}
            {items.map((item) => {
              const group = groupOf(item, catalog)
              const name = item.displayName || item.entitySid || item.sid
              const entity = toEntity(item)
              return (
                <div key={item.key} className="flex items-center gap-2 rounded border border-border p-2">
                  <CatalogIcon iconId={item.sid} name={name} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {item.sid}
                      {group && ` · ${GRID_GROUP_LABELS[group]}`}
                      {item.type === 1 && ' · zone marker'}
                      {item.entitySid && ` · SID: ${item.entitySid}`}
                    </p>
                  </div>
                  {entity && canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title={`Rename "${entity.sid}"`}
                        onClick={() => setRenameTarget(entity)}
                      >
                        <PenLine className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title={`Set display name for "${entity.sid}"`}
                        onClick={() => setDisplayNameTarget(entity)}
                      >
                        <Tag className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <RenameEntitySidDialog
        open={renameTarget !== null}
        onOpenChange={(o) => { if (!o) setRenameTarget(null) }}
        entity={renameTarget}
        existingSids={existingSids}
        usageDescriptions={
          renameTarget ? (entityUsageListMap.get(renameTarget.sid) ?? []).map(describeEntityUsage) : []
        }
        mapFilePath={mapFilePath}
      />

      <SetDisplayNameDialog
        open={displayNameTarget !== null}
        onOpenChange={(o) => { if (!o) setDisplayNameTarget(null) }}
        entity={displayNameTarget}
        mapFilePath={mapFilePath}
      />
    </>
  )
}
