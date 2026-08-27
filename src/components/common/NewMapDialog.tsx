// ─── Create New Map ──────────────────────────────────────────────────────────
// Tauri-only (needs real filesystem read access to the bundled template at
// src-tauri/resources/template.map — see create-map.ts's own doc comment
// for why this can't work purely as an in-browser feature). Creation itself
// doesn't write anything to disk — the resulting map lives entirely
// in-memory until the user's first Save/Save As. Picks a
// size and terrain biome and hands off to createNewMap() — always with zero
// players. Deliberately no player-count/spawner UI here: adding a
// city-spawner/hero-spawner already auto-grows spawns.playersCount and
// claims a new slot (backfillPlayerStartSpawner in map-write.ts), and
// deleting one shrinks it back — the exact same mechanism this dialog would
// otherwise have to re-derive. An earlier version of this dialog tried to
// auto-place N spawners on creation and got tile-index overlap wrong for
// small maps with several players; letting the user place each one by hand
// via the existing Add flow sidesteps that whole class of bug entirely.

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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the map is created and loaded, same shape as opening one. */
  onCreated: (result: { name: string; warnings: string[] }) => void
}

/** Every size this project's own map-format research confirms the real game
 *  ships (not just squares — several real maps are rectangular). */
const MAP_SIZE_PRESETS: { sizeX: number; sizeZ: number }[] = [
  { sizeX: 16, sizeZ: 16 },
  { sizeX: 32, sizeZ: 32 },
  { sizeX: 48, sizeZ: 32 },
  { sizeX: 48, sizeZ: 48 },
  { sizeX: 64, sizeZ: 32 },
  { sizeX: 64, sizeZ: 48 },
  { sizeX: 64, sizeZ: 64 },
  { sizeX: 80, sizeZ: 80 },
  { sizeX: 96, sizeZ: 64 },
  { sizeX: 96, sizeZ: 96 },
  { sizeX: 128, sizeZ: 64 },
  { sizeX: 128, sizeZ: 128 },
  { sizeX: 256, sizeZ: 128 },
  { sizeX: 256, sizeZ: 256 },
]
function presetKey(p: { sizeX: number; sizeZ: number }): string {
  return `${p.sizeX}x${p.sizeZ}`
}
const DEFAULT_SIZE_KEY = presetKey({ sizeX: 64, sizeZ: 64 })

const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

export default function NewMapDialog({ open, onOpenChange, onCreated }: Props) {
  const [mapName, setMapName] = useState('New Map')
  const [sizeKey, setSizeKey] = useState(DEFAULT_SIZE_KEY)
  const [biomeId, setBiomeId] = useState<BiomeId>(1)
  const [creating, setCreating] = useState(false)

  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await createNewMap({ mapName, sizeX: selectedSize.sizeX, sizeZ: selectedSize.sizeZ, biomeId, players: [] })
      if (!result) return // not Tauri — no filesystem access to read the template
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
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={420} defaultHeight={340} minWidth={360} minHeight={300} storageKey="new-map">
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
            <Select value={sizeKey} onValueChange={setSizeKey}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAP_SIZE_PRESETS.map((p) => (
                  <SelectItem key={presetKey(p)} value={presetKey(p)}>{p.sizeX} × {p.sizeZ}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <p className="text-xs text-muted-foreground">
            Creates a blank map with no players. Add city/hero spawners afterward in the Map Grid —
            each one automatically claims (or, when deleted, frees) a player slot.
          </p>
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
