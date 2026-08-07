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
  /** 0 = off; otherwise the on-screen thickness (px) of the category-colored
   *  border drawn around each occupied cell. */
  cellBorderThickness: number
}

export const DEFAULT_MAP_GRID_SETTINGS: MapGridSettings = {
  terrainOpacity: DEFAULT_TERRAIN_BLEND,
  iconImagesEnabled: true,
  showGridLines: false,
  cellBorderThickness: 0,
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
