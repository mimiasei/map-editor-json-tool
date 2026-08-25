// ─── Create New Map ──────────────────────────────────────────────────────────
// Tauri-only (needs real filesystem write access to produce a new .map file
// from src-tauri/resources/template.map — see create-map.ts's own doc
// comment for why this can't work purely as an in-browser feature). Picks a
// size/player-count/biome, computes a simple evenly-spread default position
// for each player's spawner (the user can Move it afterward in the Map Grid
// once the map is open), and hands off to createNewMap().

import { useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BIOME_NAMES, BIOME_BASE_COLORS, type BiomeId } from '@/lib/map-grid/terrain-colors'
import { createNewMap } from '@/lib/create-map'
import { logError, logInfo } from '@/lib/logger'
import type { BlankMapPlayer } from '@/lib/map-write'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the map is created and loaded, same shape as opening one. */
  onCreated: (result: { name: string; warnings: string[] }) => void
}

const SIZE_PRESETS = [16, 32, 48, 64, 96, 128, 256]
const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
const SPAWNER_TYPES = [
  { value: 'city-spawner', label: 'City' },
  { value: 'hero-spawner', label: 'Hero' },
] as const

/** Place N players in a grid near the top of the map, clear of the map
 *  border by enough margin that a 3x3 spawner footprint never clips out of
 *  bounds, and
 *  spaced at least 4 tiles apart so adjacent footprints never overlap — a
 *  single-row evenly-spread layout (the original approach here) breaks this
 *  for a small map with several players (e.g. 16x16/6 players spaced only
 *  2 tiles apart), and two overlapping 3x3 spawner footprints shadow each
 *  other in the tile-index stacking pick, making one of them unselectable
 *  in the Map Grid — confirmed both by computing real gaps for that case and
 *  by directly testing buildTileIndex()'s stacking behavior. Wraps into
 *  multiple rows instead of tightening the gap once a row can't fit
 *  everyone at safe spacing. */
function defaultPlayerNodes(sizeX: number, sizeZ: number, n: number): number[] {
  if (n === 0) return []
  const SPACING = 4 // > the widest real player-start footprint (3x3)
  const margin = Math.min(2, Math.max(1, Math.floor(Math.min(sizeX, sizeZ) / 4)))
  const cols = Math.max(1, Math.min(n, Math.floor((sizeX - 2 * margin) / SPACING) + 1))
  const nodes: number[] = []
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = Math.min(sizeX - 1, margin + col * SPACING)
    const z = Math.min(sizeZ - 1, margin + row * SPACING)
    nodes.push(z * sizeX + x)
  }
  return nodes
}

export default function NewMapDialog({ open, onOpenChange, onCreated }: Props) {
  const [mapName, setMapName] = useState('New Map')
  const [size, setSize] = useState(64)
  const [playerCount, setPlayerCount] = useState(2)
  const [biomeId, setBiomeId] = useState<BiomeId>(1)
  const [spawnerType, setSpawnerType] = useState<BlankMapPlayer['sid']>('city-spawner')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const nodes = defaultPlayerNodes(size, size, playerCount)
      const players: BlankMapPlayer[] = nodes.map((node) => ({ sid: spawnerType, node }))
      const result = await createNewMap({ mapName, sizeX: size, sizeZ: size, biomeId, players })
      if (!result) return // cancelled, or not Tauri
      logInfo(`Created new map: ${result.name}`)
      onCreated({ name: result.name, warnings: result.warnings })
      onOpenChange(false)
    } catch (e) {
      logError(`Failed to create new map: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={420} defaultHeight={420} minWidth={360} minHeight={360} storageKey="new-map">
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Create New Map</DialogTitle>
        </DraggableDialogDragHandle>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="new-map-name" className="text-xs">Map name</Label>
            <Input id="new-map-name" value={mapName} onChange={(e) => setMapName(e.target.value)} className="h-8 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Size</Label>
            <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZE_PRESETS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} × {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-map-players" className="text-xs">Player count</Label>
            <Input
              id="new-map-players"
              type="number"
              min={0}
              max={8}
              value={playerCount}
              onChange={(e) => setPlayerCount(Math.max(0, Math.min(8, Number(e.target.value) || 0)))}
              className="h-8 text-sm w-24"
            />
          </div>

          {playerCount > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Spawner type (all players)</Label>
              <Select value={spawnerType} onValueChange={(v) => setSpawnerType(v as BlankMapPlayer['sid'])}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPAWNER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Placed in a grid near the top edge — move them individually in the Map Grid afterward.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Terrain biome</Label>
            <div className="flex flex-wrap gap-1.5">
              {BIOME_ORDER.map((b) => (
                <button
                  key={b}
                  onClick={() => setBiomeId(b)}
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                    biomeId === b ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full border border-border/50" style={{ backgroundColor: BIOME_BASE_COLORS[b] }} />
                  {BIOME_NAMES[b]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={creating || !mapName.trim()}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
