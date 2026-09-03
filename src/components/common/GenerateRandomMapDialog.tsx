// ─── Generate Random Map (issue #210, Milestone 0) ──────────────────────────
// Tauri-only, same reasoning as NewMapDialog: needs real filesystem read
// access to the bundled template.map resource. Deliberately minimal UI for
// this first milestone — size, terrain biome, and player count only. No
// zone/template authoring yet (that's Milestone 3's "RMG template format +
// UI" item in issue #210) — every generated map today is a single flat
// zone with perimeter-spread player starts and four fixed quadrant guards.

import { useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BIOME_NAMES, BIOME_BASE_COLORS, type BiomeId } from '@/lib/map-grid/terrain-colors'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'
import { generateRandomMapFile } from '@/lib/rmg/generate-map-file'
import { logError, logInfo } from '@/lib/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (result: { name: string; warnings: string[] }) => void
}

const DEFAULT_SIZE_KEY = presetKey({ sizeX: 64, sizeZ: 64 })
const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8]

export default function GenerateRandomMapDialog({ open, onOpenChange, onGenerated }: Props) {
  const [mapName, setMapName] = useState('Random Map')
  const [sizeKey, setSizeKey] = useState(DEFAULT_SIZE_KEY)
  const [biomeId, setBiomeId] = useState<BiomeId>(1)
  const [playerCount, setPlayerCount] = useState(2)
  const [generating, setGenerating] = useState(false)

  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await generateRandomMapFile({
        mapName,
        sizeX: selectedSize.sizeX,
        sizeZ: selectedSize.sizeZ,
        biomeId,
        playerCount,
        playerSpawnerSid: 'city-spawner',
      })
      if (!result) return // not Tauri — no filesystem access to read the template
      logInfo(`Generated random map: ${result.name}`)
      onGenerated({ name: result.name, warnings: result.warnings })
      onOpenChange(false)
    } catch (e) {
      logError(`Failed to generate random map: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={420} defaultHeight={400} minWidth={360} minHeight={360} storageKey="generate-random-map">
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Generate Random Map</DialogTitle>
        </DraggableDialogDragHandle>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="rmg-map-name" className="text-xs">Map name</Label>
            <Input id="rmg-map-name" value={mapName} onChange={(e) => setMapName(e.target.value)} className="h-8 text-sm" />
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

          <div className="space-y-1.5">
            <Label className="text-xs">Players</Label>
            <Select value={String(playerCount)} onValueChange={(v) => setPlayerCount(Number(v))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYER_COUNT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Milestone 0: a single flat zone, city-spawners spread around the
            map, and four quadrant guards. No zone layout, terrain variety, or
            treasure economy yet — see issue #210 for the full roadmap.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating || !mapName.trim()}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
