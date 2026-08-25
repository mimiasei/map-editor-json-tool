// ─── Create New Map ──────────────────────────────────────────────────────────
// Tauri-only (needs real filesystem write access to produce a new .map file
// from src-tauri/resources/template.map — see create-map.ts's own doc
// comment for why this can't work purely as an in-browser feature). Picks a
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

const SIZE_PRESETS = [16, 32, 48, 64, 96, 128, 256]
const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

export default function NewMapDialog({ open, onOpenChange, onCreated }: Props) {
  const [mapName, setMapName] = useState('New Map')
  const [size, setSize] = useState(64)
  const [biomeId, setBiomeId] = useState<BiomeId>(1)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await createNewMap({ mapName, sizeX: size, sizeZ: size, biomeId, players: [] })
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
