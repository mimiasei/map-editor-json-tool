// ─── Map Grid — display settings popover (issue #125, revised in #127) ──────
// Consolidates the tunable display knobs that previously would have needed
// one toolbar control each. Persisted as one object rather than one
// localStorage key per setting.
//
// issue #127: the "grid line thickness" slider from #125 was a misreading —
// the user actually wanted a slider for the thick, category-colored border
// around each occupied cell (new: cellBorderThickness), and the 1px lines
// *between* every cell to just be a plain on/off switch (showGridLines).

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { DEFAULT_TERRAIN_BLEND } from '@/lib/map-grid/terrain-colors'
import { Settings } from 'lucide-react'

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Map Grid settings">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4" data-nodrag>
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
      </PopoverContent>
    </Popover>
  )
}
