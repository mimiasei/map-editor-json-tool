// ─── Map Grid — Obstacles/Trees brush settings popover ──────────────────────
// Same gear-icon-triggers-a-Popover-of-Sliders pattern as
// MapGridSettingsDialog.tsx, placed to the left of "Mode: Freehand/
// Rectangle" whenever the Obstacles or Trees brush is the active tool.
// Content depends on which of the two triggered it — the two tools share
// this one popover component rather than each getting its own, since only
// one of them is ever active at a time.

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

interface Props {
  tool: 'obstacles' | 'trees'
  /** Obstacles only — chance an obstacle-role pick is specifically a
   *  mountain_* entry (0 = None, 1 = Always). */
  mountainChance: number
  onMountainChanceChange: (value: number) => void
  /** Obstacles only — chance an obstacle-role pick is specifically a
   *  pool_* entry (0 = None, up to 1 = High). The higher this is, the
   *  smaller the brush can be and still get pools (down to a 3x3 minimum —
   *  see commitObstacleStroke in MapGridDialog.tsx). */
  poolChance: number
  onPoolChanceChange: (value: number) => void
  /** Trees only — 0 mixes in other biomes freely, 1 only ever uses the
   *  biome actually painted on. */
  treeBiomePurity: number
  onTreeBiomePurityChange: (value: number) => void
}

function pctLabel(value: number, zeroLabel: string, oneLabel: string): string {
  if (value <= 0) return zeroLabel
  if (value >= 1) return oneLabel
  return `${Math.round(value * 100)}%`
}

export default function ToolBrushSettingsPopover({
  tool,
  mountainChance,
  onMountainChanceChange,
  poolChance,
  onPoolChanceChange,
  treeBiomePurity,
  onTreeBiomePurityChange,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={tool === 'obstacles' ? 'Obstacle brush settings' : 'Tree brush settings'}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4" data-nodrag>
        {tool === 'obstacles' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mountains</Label>
                <span className="text-xs text-muted-foreground">{pctLabel(mountainChance, 'None', 'Always')}</span>
              </div>
              <Slider
                min={0} max={1} step={0.01}
                value={[mountainChance]}
                onValueChange={([v]) => onMountainChanceChange(v)}
              />
              <p className="text-[11px] text-muted-foreground">Chance of a mountain in the cluster.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Pools</Label>
                <span className="text-xs text-muted-foreground">{pctLabel(poolChance, 'None', 'High')}</span>
              </div>
              <Slider
                min={0} max={1} step={0.01}
                value={[poolChance]}
                onValueChange={([v]) => onPoolChanceChange(v)}
              />
              <p className="text-[11px] text-muted-foreground">
                Chance of a pool in the cluster. Higher chance allows a smaller brush (down to 3×3).
              </p>
            </div>
          </>
        )}

        {tool === 'trees' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Biome mix</Label>
              <span className="text-xs text-muted-foreground">
                {treeBiomePurity >= 1 ? 'This biome only' : treeBiomePurity <= 0 ? 'All biomes' : `${Math.round(treeBiomePurity * 100)}% pure`}
              </span>
            </div>
            <Slider
              min={0} max={1} step={0.01}
              value={[treeBiomePurity]}
              onValueChange={([v]) => onTreeBiomePurityChange(v)}
            />
            <p className="text-[11px] text-muted-foreground">
              How much tree types vary from other biomes vs. only the biome painted on.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
