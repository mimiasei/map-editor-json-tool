// ─── Map Grid — display settings popover (issue #125, revised in #127) ──────
// Consolidates the tunable display knobs that previously would have needed
// one toolbar control each. Persisted as one object rather than one
// localStorage key per setting.
//
// issue #127: the "grid line thickness" slider from #125 was a misreading —
// the user actually wanted a slider for the thick, category-colored border
// around each occupied cell (new: cellBorderThickness), and the 1px lines
// *between* every cell to just be a plain on/off switch (showGridLines).

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DEFAULT_TERRAIN_BLEND } from '@/lib/map-grid/terrain-colors'
import {
  DRAW_QUALITY_LIMITS, DRAW_QUALITY_PRESETS, estimateCanvasMegabytes, layerPxPerTile, resolveDrawQuality,
  type CanvasLayerQuality, type DrawQuality, type DrawQualityChoice,
} from '@/lib/map-grid/draw-quality'
import { useMapContextStore } from '@/store/useMapContextStore'
import { biomeTexturesAvailable } from '@/lib/map-grid/terrain-textures'
import { DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, type DifficultyRange, type DifficultyWeight } from '@/lib/map-grid/squad-pool'
import { Settings, ChevronDown } from '@/components/ui/icons'

export interface MapGridSettings {
  /** 0-1, blended against white for the terrain fill (see terrainFillColor). */
  terrainOpacity: number
  /** The game's ground textures under the terrain colours (strength: TERRAIN_TEXTURE_STRENGTH). Needs the textures extracted,
   *  see biomeTexturesAvailable(). */
  terrainTextureEnabled: boolean
  /** When false, every cell forces its letter-badge fallback instead of a real icon. */
  iconImagesEnabled: boolean
  /** When false, a rotated object's small green degree badge is hidden. */
  rotationNumberEnabled: boolean
  /** When false, the small badge with the number of objects on a tile is hidden. */
  objectCountEnabled: boolean
  /** When true, a ground texture fades into the neighbouring biome's along land-to-land borders. */
  biomeEdgeFade: boolean
  /** How finely each layer is drawn: a preset, or 'custom' with the numbers in drawQualityCustom (draw-quality.ts). */
  drawQuality: DrawQualityChoice
  drawQualityCustom: DrawQuality
  /** 1px lines between every cell, on/off — always the same fixed thickness. */
  showGridLines: boolean
  /** 0 = off (icon fills the whole tile); otherwise the number of screen
   *  pixels the icon is inset by on each side, revealing that much of the
   *  always-on canvas swatch underneath — which is already drawn in the
   *  tile's category color, so shrinking the icon is what creates a
   *  colored "border" effect, not an actual CSS border (a previous version
   *  of this drew one directly, but it never controlled what actually
   *  reads as a border — the icon's own fixed size did). */
  cellBorderThickness: number
    /** Turns on/off the tile row and column number next to the map itself */
  showGridNumbers: boolean
    /** Turns on/off the tile hover border */
  showGridHover: boolean
  /** Translucent red fill over every tile a hero can't walk onto — object
   *  footprints, unrampted elevation walls, and water (see passability.ts).
   *  Toggled from the header icon row now, not this popover — kept here only
   *  for persistence. */
  showBlockedTiles: boolean
  /** Translucent darker/lighter fill over every level -1 / level 1 tile (see
   *  elevation-shading.ts) — a flat elevation-relief tint, independent of the
   *  blocked-tile overlay's wall-vs-interior distinction. */
  showElevationShading: boolean
  /** The game's own cliff pieces along the edges of raised ground (cliff-autotile.ts); needs the "cliffs" render job. */
  showCliffs: boolean
  /** Roads and rivers filled with the game's own textures instead of flat colours (needs the extracted textures). */
  lineFeatureTextures: boolean
  /** Water as a translucent teal plane over the cliff walls, with the game's ripple shading and glints (water-surface.ts), also on rivers. */
  waterSurface: boolean
  /** Translucent per-zone color fill over every painted "Player Areas" tile
   *  (see zone-colors.ts) — an escape hatch to hide the overlay, same
   *  rationale as showBlockedTiles above. */
  showPlayerAreas: boolean
  /** A thin darker strip along the long edges of a road/river band (the
   *  edges parallel to its direction of travel, not the short end caps) —
   *  purely cosmetic, on the line-feature canvas in MapGridDialog.tsx. */
  lineFeatureShading: boolean
  /** Advanced — Encounter tool's per-difficulty requestedValue min/max
   *  (including Random's own flat span, kept for the Browse-mode quick-pick
   *  buttons which roll it directly). See squad-pool.ts's own doc comment
   *  for why every consumer takes this as a parameter instead of importing
   *  the DEFAULT_* constant directly. */
  squadDifficultyRanges: DifficultyRange[]
  /** Advanced — how often Encounter's Random difficulty picks each named
   *  bucket (weighted, not a flat roll — see pickSquadRange). */
  squadRandomWeights: DifficultyWeight[]
  /** Advanced — Terrain bucket-fill (issue #205) treats any blocked tile
   *  (object footprint, unrampted elevation wall, water — see
   *  buildBlockedTileSet) as a boundary in addition to the biome match,
   *  so the flood-fill stops at a mountain/building instead of painting
   *  underneath it. Off by default to preserve prior bucket-fill behavior. */
  bucketFillObjectsAsBoundary: boolean
  /** On/off for the optional user-loaded background reference image (see
   *  MapGridDialog's backgroundImage state). The loaded image itself is
   *  never persisted here — only this toggle and its opacity below — an
   *  image can be several MB as a data/object URL, a poor fit for the
   *  shared localStorage blob every other setting here lives in. */
  backgroundImageVisible: boolean
  /** 0-1 opacity of the background reference image, independent of
   *  terrainOpacity above — the two are meant to be tuned separately
   *  (e.g. full terrain opacity with a faint reference image, or vice
   *  versa). */
  backgroundImageOpacity: number
  /** Ask for confirmation before deleting a single placed object. Clear All
   *  always asks, regardless of this. */
  confirmBeforeDelete: boolean
}

/** How strongly the ground textures show over the flat terrain colours (0-1). 1 = the texture alone: the colour layer is drawn fully transparent. */
export const TERRAIN_TEXTURE_STRENGTH = 1

export const DEFAULT_MAP_GRID_SETTINGS: MapGridSettings = {
  terrainOpacity: DEFAULT_TERRAIN_BLEND,
  terrainTextureEnabled: true,
  iconImagesEnabled: true,
  rotationNumberEnabled: true,
  objectCountEnabled: true,
  biomeEdgeFade: true,
  drawQuality: 'high',
  drawQualityCustom: DRAW_QUALITY_PRESETS.high,
  showGridLines: false,
  cellBorderThickness: 0,
  showGridNumbers: false,
  showGridHover: true,
  showBlockedTiles: false,
  showElevationShading: true,
  showCliffs: true,
  lineFeatureTextures: true,
  waterSurface: true,
  showPlayerAreas: true,
  lineFeatureShading: true,
  squadDifficultyRanges: DEFAULT_SQUAD_DIFFICULTY_RANGES,
  squadRandomWeights: DEFAULT_SQUAD_RANDOM_WEIGHTS,
  bucketFillObjectsAsBoundary: false,
  backgroundImageVisible: true,
  backgroundImageOpacity: 0.5,
  confirmBeforeDelete: true,
}

const SETTINGS_STORAGE_KEY = 'oe-map-grid-settings'

/** Earlier default difficulty ranges: up to v0.9.5-3, and the interim ones of v0.9.5-4. Any setting change saves the whole settings blob, so
 *  these can sit in storage as if the user had chosen them, and the raised defaults would never reach them. Ranges still equal to one of
 *  these were never edited and are replaced. */
const PREVIOUS_DEFAULT_SQUAD_RANGES = [
  [[500, 15000], [400, 2000], [2001, 4000], [4001, 6000], [6001, 8000], [8001, 16000]],
  [[875, 26250], [700, 3500], [3501, 7000], [7001, 10500], [10501, 14000], [14001, 28000]],
].map((bounds) => JSON.stringify(['Random', 'Easy', 'Normal', 'Difficult', 'Impossible', 'Lethal'].map((label, i) => ({ label, min: bounds[i][0], max: bounds[i][1] }))))

export function loadMapGridSettings(): MapGridSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      if (PREVIOUS_DEFAULT_SQUAD_RANGES.includes(JSON.stringify(saved.squadDifficultyRanges))) delete saved.squadDifficultyRanges
      return { ...DEFAULT_MAP_GRID_SETTINGS, ...saved }
    }
  } catch { /* ignore */ }
  return DEFAULT_MAP_GRID_SETTINGS
}

export function saveMapGridSettings(settings: MapGridSettings): void {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
}

interface Props {
  settings: MapGridSettings
  onChange: (next: MapGridSettings) => void
  /** Whether a background reference image is currently loaded (session-only
   *  state owned by MapGridDialog, not part of `settings` — see that field's
   *  own doc comment above). */
  hasBackgroundImage: boolean
  onLoadBackgroundImage: () => void
  onRemoveBackgroundImage: () => void
}

export default function MapGridSettingsDialog({
  settings, onChange, hasBackgroundImage, onLoadBackgroundImage, onRemoveBackgroundImage,
}: Props) {
  const update = (patch: Partial<MapGridSettings>) => onChange({ ...settings, ...patch })
  // Not persisted — purely a "did the user open this section" UI state,
  // same as every other popover's own open/closed state.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Select primitives: an object built inside the selector is a new reference every call and loops the render.
  const mapSizeX = useMapContextStore((s) => s.context?.sizeX)
  const mapSizeZ = useMapContextStore((s) => s.context?.sizeZ)
  const mapSize = mapSizeX && mapSizeZ ? { x: mapSizeX, z: mapSizeZ } : null
  const quality = resolveDrawQuality(settings.drawQuality, settings.drawQualityCustom)
  const setQualityChoice = (choice: DrawQualityChoice) => {
    // Picking Custom starts from the numbers of the preset in use.
    update(choice === 'custom' ? { drawQuality: choice, drawQualityCustom: quality } : { drawQuality: choice })
  }
  const updateCustom = (patch: Partial<DrawQuality>) => update({ drawQuality: 'custom', drawQualityCustom: { ...quality, ...patch } })
  const layerRows: { key: 'terrain' | 'cliffs' | 'lines'; label: string }[] = [
    { key: 'terrain', label: 'Terrain textures' },
    { key: 'cliffs', label: 'Cliff edges' },
    { key: 'lines', label: 'Roads and rivers' },
  ]

  const updateRange = (label: string, patch: Partial<Pick<DifficultyRange, 'min' | 'max'>>) => {
    update({
      squadDifficultyRanges: settings.squadDifficultyRanges.map((r) => (r.label === label ? { ...r, ...patch } : r)),
    })
  }
  const updateWeight = (label: string, weight: number) => {
    update({
      squadRandomWeights: settings.squadRandomWeights.map((w) => (w.label === label ? { ...w, weight } : w)),
    })
  }
  const totalWeight = settings.squadRandomWeights.reduce((sum, w) => sum + w.weight, 0)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Map Grid settings">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={`${advancedOpen ? 'w-80' : 'w-64'} space-y-4 transition-[width] max-h-[min(80vh,var(--radix-popover-content-available-height))] overflow-y-auto`}
        data-nodrag
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="grid-terrain-texture" className="text-xs cursor-pointer">Terrain texture</Label>
            <Switch
              id="grid-terrain-texture"
              checked={settings.terrainTextureEnabled}
              onCheckedChange={(v) => update({ terrainTextureEnabled: v })}
              disabled={!biomeTexturesAvailable()}
            />
          </div>
          {!biomeTexturesAvailable() && (
            <p className="text-[10px] text-muted-foreground">Extract the game images (desktop app) to enable ground textures.</p>
          )}
        </div>

        {!(settings.terrainTextureEnabled && biomeTexturesAvailable()) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Terrain opacity</Label>
              <span className="text-xs text-muted-foreground">{Math.round(settings.terrainOpacity * 100)}%</span>
            </div>
            <Slider
              min={0} max={1} step={0.01}
              value={[settings.terrainOpacity]}
              onValueChange={([v]) => update({ terrainOpacity: v })}
            />
          </div>
        )}

        {/* Only drawn on the ground textures, so it has nothing to do while they are off. */}
        {settings.terrainTextureEnabled && biomeTexturesAvailable() && (
          <div className="flex items-center justify-between">
            <Label htmlFor="grid-biome-fade" className="text-xs cursor-pointer">Fade between biomes</Label>
            <Switch
              id="grid-biome-fade"
              checked={settings.biomeEdgeFade}
              onCheckedChange={(v) => update({ biomeEdgeFade: v })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-icon-images" className="text-xs cursor-pointer">Icon images</Label>
          <Switch
            id="grid-icon-images"
            checked={settings.iconImagesEnabled}
            onCheckedChange={(v) => update({ iconImagesEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-rotation-numbers" className="text-xs cursor-pointer">Rotation numbers</Label>
          <Switch
            id="grid-rotation-numbers"
            checked={settings.rotationNumberEnabled}
            onCheckedChange={(v) => update({ rotationNumberEnabled: v })}
          />
        </div>

        <div className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Drawing quality</Label>
            <select
              className="h-6 rounded border border-input bg-background px-1 text-xs"
              value={settings.drawQuality}
              onChange={(e) => setQualityChoice(e.target.value as DrawQualityChoice)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {mapSize && 'Current: ' + estimateCanvasMegabytes(quality, mapSize.x, mapSize.z) + ' MB of canvas memory.'}
          </p>
          {settings.drawQuality === 'custom' && (
            <div className="space-y-2">
              {layerRows.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{label}</Label>
                    <span className="text-xs text-muted-foreground">
                      {quality[key].pxPerTile} px/tile{mapSize ? ` (now ${layerPxPerTile(quality[key], mapSize.x, mapSize.z)})` : ''}
                    </span>
                  </div>
                  <Slider
                    min={DRAW_QUALITY_LIMITS.pxPerTile.min} max={DRAW_QUALITY_LIMITS.pxPerTile.max} step={4}
                    value={[quality[key].pxPerTile]}
                    onValueChange={([v]) => updateCustom({ [key]: { ...quality[key], pxPerTile: v } as CanvasLayerQuality })}
                  />
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Largest canvas side</Label>
                    <span className="text-[11px] text-muted-foreground">{quality[key].maxSide} px</span>
                  </div>
                  <Slider
                    min={DRAW_QUALITY_LIMITS.maxSide.min} max={DRAW_QUALITY_LIMITS.maxSide.max} step={512}
                    value={[quality[key].maxSide]}
                    onValueChange={([v]) => updateCustom({ [key]: { ...quality[key], maxSide: v } as CanvasLayerQuality })}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Object icons from</Label>
                  <span className="text-xs text-muted-foreground">{quality.objects.iconFromPx} px per tile on screen</span>
                </div>
                <Slider
                  min={DRAW_QUALITY_LIMITS.iconFromPx.min} max={DRAW_QUALITY_LIMITS.iconFromPx.max} step={2}
                  value={[quality.objects.iconFromPx]}
                  onValueChange={([v]) => updateCustom({ objects: { ...quality.objects, iconFromPx: v } })}
                />
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">Extra tiles beyond the screen</Label>
                  <span className="text-[11px] text-muted-foreground">{quality.objects.overdrawTiles}</span>
                </div>
                <Slider
                  min={DRAW_QUALITY_LIMITS.overdrawTiles.min} max={DRAW_QUALITY_LIMITS.overdrawTiles.max} step={1}
                  value={[quality.objects.overdrawTiles]}
                  onValueChange={([v]) => updateCustom({ objects: { ...quality.objects, overdrawTiles: v } })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-object-count" className="text-xs cursor-pointer">Object count per tile</Label>
          <Switch
            id="grid-object-count"
            checked={settings.objectCountEnabled}
            onCheckedChange={(v) => update({ objectCountEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-lines" className="text-xs cursor-pointer">Grid lines</Label>
          <Switch
            id="grid-show-lines"
            checked={settings.showGridLines}
            onCheckedChange={(v) => update({ showGridLines: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-numbers" className="text-xs cursor-pointer">Grid numbers</Label>
          <Switch
              id="grid-show-numbers"
              checked={settings.showGridNumbers}
              onCheckedChange={(v) => update({ showGridNumbers: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-hover" className="text-xs cursor-pointer">Grid hover border</Label>
          <Switch
              id="grid-show-hover"
              checked={settings.showGridHover}
              onCheckedChange={(v) => update({ showGridHover: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-elevation" className="text-xs cursor-pointer">Elevation shading</Label>
          <Switch
              id="grid-show-elevation"
              checked={settings.showElevationShading}
              onCheckedChange={(v) => update({ showElevationShading: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-cliffs" className="text-xs cursor-pointer">Cliff edges</Label>
          <Switch
              id="grid-show-cliffs"
              checked={settings.showCliffs}
              onCheckedChange={(v) => update({ showCliffs: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-show-player-areas" className="text-xs cursor-pointer">Player Areas fill</Label>
          <Switch
              id="grid-show-player-areas"
              checked={settings.showPlayerAreas}
              onCheckedChange={(v) => update({ showPlayerAreas: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-line-feature-textures" className="text-xs cursor-pointer">Textured roads and rivers</Label>
          <Switch
              id="grid-line-feature-textures"
              checked={settings.lineFeatureTextures}
              onCheckedChange={(v) => update({ lineFeatureTextures: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-water-surface" className="text-xs cursor-pointer">Water ripples and surface</Label>
          <Switch
              id="grid-water-surface"
              checked={settings.waterSurface}
              onCheckedChange={(v) => update({ waterSurface: v })}
          />
        </div>

        {!settings.lineFeatureTextures && (
          <div className="flex items-center justify-between">
            <Label htmlFor="grid-line-feature-shading" className="text-xs cursor-pointer">Road/river edge shading</Label>
            <Switch
                id="grid-line-feature-shading"
                checked={settings.lineFeatureShading}
                onCheckedChange={(v) => update({ lineFeatureShading: v })}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Cell border thickness</Label>
            <span className="text-xs text-muted-foreground">
              {settings.cellBorderThickness === 0 ? 'Off' : `${settings.cellBorderThickness}px`}
            </span>
          </div>
          <Slider
            min={0} max={4} step={1}
            value={[settings.cellBorderThickness]}
            onValueChange={([v]) => update({ cellBorderThickness: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-confirm-delete" className="text-xs cursor-pointer">Confirm before deleting</Label>
          <Switch
            id="grid-confirm-delete"
            checked={settings.confirmBeforeDelete}
            onCheckedChange={(v) => update({ confirmBeforeDelete: v })}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Background image</Label>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={hasBackgroundImage ? onRemoveBackgroundImage : onLoadBackgroundImage}
            >
              {hasBackgroundImage ? 'Remove' : 'Load…'}
            </Button>
          </div>

          {hasBackgroundImage && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="grid-bg-image-visible" className="text-xs cursor-pointer">Show background image</Label>
                <Switch
                  id="grid-bg-image-visible"
                  checked={settings.backgroundImageVisible}
                  onCheckedChange={(v) => update({ backgroundImageVisible: v })}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Background image opacity</Label>
                  <span className="text-xs text-muted-foreground">{Math.round(settings.backgroundImageOpacity * 100)}%</span>
                </div>
                <Slider
                  min={0} max={1} step={0.01}
                  value={[settings.backgroundImageOpacity]}
                  onValueChange={([v]) => update({ backgroundImageOpacity: v })}
                />
              </div>
            </>
          )}
        </div>

        <div className="pt-1 border-t border-border">
          <Button
            variant="secondary"
            size="sm"
            className="w-full h-7 text-xs justify-between mt-3"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            Advanced
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </Button>

          {advancedOpen && (
            <div className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="grid-bucket-objects-boundary" className="text-xs cursor-pointer">Terrain bucket-fill stops at objects</Label>
                <Switch
                    id="grid-bucket-objects-boundary"
                    checked={settings.bucketFillObjectsAsBoundary}
                    onCheckedChange={(v) => update({ bucketFillObjectsAsBoundary: v })}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Encounter — Random weights
                </p>
                <p className="text-[11px] text-muted-foreground">
                  How often the Encounter tool's Random difficulty picks each bucket. Shown as a share of the total — doesn't need to add up to 100.
                </p>
                {settings.squadRandomWeights.map((w) => (
                  <div key={w.label} className="flex items-center gap-2">
                    <Label className="text-xs w-20 shrink-0">{w.label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={w.weight}
                      onChange={(e) => updateWeight(w.label, Math.max(0, Number(e.target.value) || 0))}
                      className="h-7 text-xs w-16"
                    />
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {totalWeight > 0 ? `${Math.round((w.weight / totalWeight) * 100)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Encounter — value ranges
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Total army value rolled for each difficulty (Random included — used by the Browse-mode Value field's own quick-pick button).
                </p>
                {settings.squadDifficultyRanges.map((r) => (
                  <div key={r.label} className="flex items-center gap-2">
                    <Label className="text-xs w-16 shrink-0">{r.label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={r.min}
                      title="Min"
                      onChange={(e) => updateRange(r.label, { min: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-7 text-xs w-20"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min={0}
                      value={r.max}
                      title="Max"
                      onChange={(e) => updateRange(r.label, { max: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-7 text-xs w-20"
                    />
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-xs"
                onClick={() => update({ squadDifficultyRanges: DEFAULT_SQUAD_DIFFICULTY_RANGES, squadRandomWeights: DEFAULT_SQUAD_RANDOM_WEIGHTS })}
              >
                Reset to defaults
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
