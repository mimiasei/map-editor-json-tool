// ─── Generate Random Map (issue #210, Milestone 3) ──────────────────────────
// Tauri-only, same reasoning as NewMapDialog: needs real filesystem read
// access to the bundled template.map resource (plus a loaded GameCatalog —
// see generate-map-file.ts). Terrain is zone-driven (each zone gets its own
// biome, see zone-population.ts) so there's no single map-wide biome to
// pick. The Advanced section exposes the real template parameters this
// generator supports (water/obstacle/treasure density, a reproducibility
// seed) via template.ts's own RandomMapTemplate format, with Save/Load
// buttons reusing native-fs.ts's generic JSON open/save (works in both
// builds, even though generation itself is Tauri-only) — deliberately
// scoped down from VCMI's own per-zone template authoring (no zone-graph
// topology editor exists yet; see issue #210's Milestone 4/5 notes).

import { useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MAP_SIZE_PRESETS, presetKey } from '@/components/common/NewMapDialog'
import { generateRandomMapFile } from '@/lib/rmg/generate-map-file'
import { DEFAULT_TEMPLATE_OVERRIDES, RMG_TEMPLATE_VERSION, parseRandomMapTemplate, stringifyRandomMapTemplate, type RandomMapTemplate } from '@/lib/rmg/template'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { openFile, saveFile } from '@/lib/native-fs'
import { logError, logInfo, logWarn } from '@/lib/logger'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (result: { name: string; warnings: string[] }) => void
}

const DEFAULT_SIZE_KEY = presetKey({ sizeX: 64, sizeZ: 64 })
const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8]

function pctLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** The preset closest in tile area to `(sizeX, sizeZ)` — used when loading
 *  a template whose size doesn't exactly match a preset, so the dialog's
 *  preset-only Size selector still shows something sensible rather than
 *  silently reverting to the default. */
function closestPreset(sizeX: number, sizeZ: number): { sizeX: number; sizeZ: number } {
  const targetArea = sizeX * sizeZ
  return MAP_SIZE_PRESETS.reduce((best, p) => (
    Math.abs(p.sizeX * p.sizeZ - targetArea) < Math.abs(best.sizeX * best.sizeZ - targetArea) ? p : best
  ), MAP_SIZE_PRESETS[0])
}

export default function GenerateRandomMapDialog({ open, onOpenChange, onGenerated }: Props) {
  const [mapName, setMapName] = useState('Random Map')
  const [sizeKey, setSizeKey] = useState(DEFAULT_SIZE_KEY)
  const [playerCount, setPlayerCount] = useState(2)
  const [waterContent, setWaterContent] = useState<'none' | 'normal' | 'islands'>(DEFAULT_TEMPLATE_OVERRIDES.waterContent)
  const [waterChance, setWaterChance] = useState(DEFAULT_TEMPLATE_OVERRIDES.waterChance)
  const [obstacleDensity, setObstacleDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity)
  const [treasureDensity, setTreasureDensity] = useState(DEFAULT_TEMPLATE_OVERRIDES.treasureDensity)
  const [objectVariety, setObjectVariety] = useState(DEFAULT_TEMPLATE_OVERRIDES.objectVariety)
  const [usePortals, setUsePortals] = useState(DEFAULT_TEMPLATE_OVERRIDES.usePortals)
  const [zoneJaggedness, setZoneJaggedness] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness)
  const [zoneSpread, setZoneSpread] = useState(DEFAULT_TEMPLATE_OVERRIDES.zoneSpread)
  const [seedText, setSeedText] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const selectedSize = MAP_SIZE_PRESETS.find((p) => presetKey(p) === sizeKey) ?? MAP_SIZE_PRESETS[6]

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const seed = seedText.trim() ? Number(seedText) : undefined
      const result = await generateRandomMapFile({
        mapName,
        sizeX: selectedSize.sizeX,
        sizeZ: selectedSize.sizeZ,
        playerCount,
        playerSpawnerSid: 'city-spawner',
        waterContent,
        waterChance,
        obstacleDensity,
        treasureDensity,
        objectVariety,
        usePortals,
        zoneJaggedness,
        zoneSpread,
        rng: seed !== undefined && Number.isFinite(seed) ? createSeededRng(seed) : undefined,
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

  const handleSaveTemplate = async () => {
    const template: RandomMapTemplate = {
      version: RMG_TEMPLATE_VERSION,
      sizeX: selectedSize.sizeX,
      sizeZ: selectedSize.sizeZ,
      playerCount,
      playerSpawnerSid: 'city-spawner',
      waterContent,
      waterChance,
      obstacleDensity,
      treasureDensity,
      objectVariety,
      usePortals,
      zoneJaggedness,
      zoneSpread,
      seed: seedText.trim() && Number.isFinite(Number(seedText)) ? Number(seedText) : undefined,
    }
    await saveFile(stringifyRandomMapTemplate(template), 'rmg-template.json')
  }

  const handleLoadTemplate = async () => {
    const file = await openFile()
    if (!file) return
    try {
      const template = parseRandomMapTemplate(file.content)
      const matchedPreset = MAP_SIZE_PRESETS.find((p) => p.sizeX === template.sizeX && p.sizeZ === template.sizeZ)
      if (!matchedPreset) {
        logWarn(`RMG template size ${template.sizeX}×${template.sizeZ} isn't one of this dialog's presets — using the closest preset instead`)
      }
      const size = matchedPreset ?? closestPreset(template.sizeX, template.sizeZ)
      setSizeKey(presetKey(size))
      setPlayerCount(template.playerCount)
      setWaterContent(template.waterContent)
      setWaterChance(template.waterChance)
      setObstacleDensity(template.obstacleDensity)
      setTreasureDensity(template.treasureDensity)
      setObjectVariety(template.objectVariety)
      setUsePortals(template.usePortals)
      setZoneJaggedness(template.zoneJaggedness)
      setZoneSpread(template.zoneSpread)
      setSeedText(template.seed !== undefined ? String(template.seed) : '')
      setAdvancedOpen(true)
      logInfo(`Loaded RMG template: ${file.name}`)
    } catch (e) {
      logError(`Failed to load RMG template: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={420} defaultHeight={advancedOpen ? 620 : 400} minWidth={360} minHeight={320} storageKey="generate-random-map">
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

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Advanced
          </button>

          {advancedOpen && (
            <div className="space-y-4 pl-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Controls the Penrose-tiling zone-shaping pass's own vertex density — low values give coarser, blockier zone/biome boundaries, high values give finer, more jagged ones.">
                    Zone jaggedness
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(zoneJaggedness)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[zoneJaggedness]} onValueChange={([v]) => setZoneJaggedness(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="How tightly zones pack together. Below 1×: denser, more crowded zone interiors. Above 1×: more open space per zone, generally cleaner-looking roads.">
                    Zone spread
                  </Label>
                  <span className="text-xs text-muted-foreground">{zoneSpread.toFixed(2)}×</span>
                </div>
                <Slider min={0.5} max={1.8} step={0.05} value={[zoneSpread]} onValueChange={([v]) => setZoneSpread(v)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs" title="None: no water at all. Normal: lakes inside some neutral zones. Islands: some neutral zones are fully cut off by water and reached only through a portal — Olden Era has no boats.">
                  Water content
                </Label>
                <Select value={waterContent} onValueChange={(v) => setWaterContent(v as 'none' | 'normal' | 'islands')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="islands">Islands</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {waterContent !== 'none' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      className="text-xs"
                      title={
                        waterContent === 'islands'
                          ? 'How many neutral zones become islands, and how little land each keeps. Player zones are never islands.'
                          : 'How much of each neutral zone\'s free area becomes a lake, and how likely a zone is to get one at all. Player zones never get water.'
                      }
                    >
                      {waterContent === 'islands' ? 'Island amount' : 'Water amount'}
                    </Label>
                    <span className="text-xs text-muted-foreground">{pctLabel(waterChance)}</span>
                  </div>
                  <Slider min={0} max={1} step={0.05} value={[waterChance]} onValueChange={([v]) => setWaterChance(v)} />
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Obstacle density</Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(obstacleDensity)}</span>
                </div>
                <Slider min={0} max={0.5} step={0.02} value={[obstacleDensity]} onValueChange={([v]) => setObstacleDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Treasure density</Label>
                  <span className="text-xs text-muted-foreground">{treasureDensity.toFixed(1)}×</span>
                </div>
                <Slider min={0} max={3} step={0.1} value={[treasureDensity]} onValueChange={([v]) => setTreasureDensity(v)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" title="Chance a given treasure/guard slot places a real, specific object (a resource pile, a named artifact, a pre-composed army) instead of a random placeholder.">
                    Object variety
                  </Label>
                  <span className="text-xs text-muted-foreground">{pctLabel(objectVariety)}</span>
                </div>
                <Slider min={0} max={1} step={0.05} value={[objectVariety]} onValueChange={([v]) => setObjectVariety(v)} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="rmg-use-portals" className="text-xs" title="Adds one bonus portal-pair shortcut between the map's two most distant zones, on top of the normal roads — a shortcut, not a replacement.">
                  Use portals
                </Label>
                <Switch id="rmg-use-portals" checked={usePortals} onCheckedChange={setUsePortals} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rmg-seed" className="text-xs">Seed (optional — same seed, same map)</Label>
                <Input
                  id="rmg-seed"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Random"
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveTemplate} className="flex-1">
                  Save Template…
                </Button>
                <Button variant="outline" size="sm" onClick={handleLoadTemplate} className="flex-1">
                  Load Template…
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            One zone per player plus a neutral zone between each pair, each
            with its own biome/faction, roads connecting every zone, one
            river, and biome-appropriate scenery. Player zones get a
            faction-matched starting dwelling, mine, and guard; neutral
            zones get a mine (guarded to its own real economic value) and
            scaled treasure. No zone-shape variety yet — see issue #210 for
            the full roadmap.
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
