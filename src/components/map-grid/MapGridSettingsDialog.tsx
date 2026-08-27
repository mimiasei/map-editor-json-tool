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
import { DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, type DifficultyRange, type DifficultyWeight } from '@/lib/map-grid/squad-pool'
import { Settings, ChevronDown } from 'lucide-react'

export interface MapGridSettings {
  /** 0-1, blended against white for the terrain fill (see terrainFillColor). */
  terrainOpacity: number
  /** When false, every cell forces its letter-badge fallback instead of a real icon. */
  iconImagesEnabled: boolean
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
}

export const DEFAULT_MAP_GRID_SETTINGS: MapGridSettings = {
  terrainOpacity: DEFAULT_TERRAIN_BLEND,
  iconImagesEnabled: true,
  showGridLines: false,
  cellBorderThickness: 0,
  showGridNumbers: false,
  showGridHover: true,
  showBlockedTiles: false,
  showElevationShading: true,
  lineFeatureShading: true,
  squadDifficultyRanges: DEFAULT_SQUAD_DIFFICULTY_RANGES,
  squadRandomWeights: DEFAULT_SQUAD_RANDOM_WEIGHTS,
}

const SETTINGS_STORAGE_KEY = 'oe-map-grid-settings'

export function loadMapGridSettings(): MapGridSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) return { ...DEFAULT_MAP_GRID_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_MAP_GRID_SETTINGS
}

export function saveMapGridSettings(settings: MapGridSettings): void {
  try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
}

interface Props {
  settings: MapGridSettings
  onChange: (next: MapGridSettings) => void
}

export default function MapGridSettingsDialog({ settings, onChange }: Props) {
  const update = (patch: Partial<MapGridSettings>) => onChange({ ...settings, ...patch })
  // Not persisted — purely a "did the user open this section" UI state,
  // same as every other popover's own open/closed state.
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
      <PopoverContent align="end" className={`${advancedOpen ? 'w-80' : 'w-64'} space-y-4 transition-[width]`} data-nodrag>
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

        <div className="flex items-center justify-between">
          <Label htmlFor="grid-icon-images" className="text-xs cursor-pointer">Icon images</Label>
          <Switch
            id="grid-icon-images"
            checked={settings.iconImagesEnabled}
            onCheckedChange={(v) => update({ iconImagesEnabled: v })}
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
          <Label htmlFor="grid-line-feature-shading" className="text-xs cursor-pointer">Road/river edge shading</Label>
          <Switch
              id="grid-line-feature-shading"
              checked={settings.lineFeatureShading}
              onCheckedChange={(v) => update({ lineFeatureShading: v })}
          />
        </div>

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
