// ─── Map Grid — Obstacles/Trees/Interactable brush settings popover ────────
// Same gear-icon-triggers-a-Popover-of-Sliders pattern as
// MapGridSettingsDialog.tsx, placed to the left of "Mode: Freehand/
// Rectangle" whenever the Obstacles, Trees, or Interactable brush is the
// active tool. Content depends on which one triggered it — all three share
// this one popover component rather than each getting its own, since only
// one of them is ever active at a time.

import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

interface Props {
  tool: 'obstacles' | 'trees' | 'interactable'
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
  /** All three tools — 0 mixes in other biomes freely, 1 only ever uses the
   *  biome actually painted on. */
  biomePurity: number
  onBiomePurityChange: (value: number) => void
  /** All three tools — whether a cross-biome pick can land on a visually
   *  jarring biome (Snow decorations on Grass, Lava objects anywhere else,
   *  etc. — see areBiomesCompatible, fuzzy-obstacle.ts). */
  allowHighContrastBiomes: boolean
  onAllowHighContrastBiomesChange: (value: boolean) => void
}

function pctLabel(value: number, zeroLabel: string, oneLabel: string): string {
  if (value <= 0) return zeroLabel
  if (value >= 1) return oneLabel
  return `${Math.round(value * 100)}%`
}

const TOOL_TITLES: Record<Props['tool'], string> = {
  obstacles: 'Obstacle brush settings',
  trees: 'Tree brush settings',
  interactable: 'Interactable brush settings',
}

/** Every setting's description moved from an always-visible line of text to
 *  a hover tooltip on its label (user-requested) — the dotted underline is
 *  the hover affordance since there's no other visual cue a label is
 *  interactive here. */
function LabelWithTooltip({ htmlFor, tooltip, children }: { htmlFor?: string; tooltip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Label
          htmlFor={htmlFor}
          className="text-xs cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2"
        >
          {children}
        </Label>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export default function ToolBrushSettingsPopover({
  tool,
  mountainChance,
  onMountainChanceChange,
  poolChance,
  onPoolChanceChange,
  biomePurity,
  onBiomePurityChange,
  allowHighContrastBiomes,
  onAllowHighContrastBiomesChange,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={TOOL_TITLES[tool]}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4" data-nodrag>
        {tool === 'obstacles' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <LabelWithTooltip tooltip="Chance of a mountain in the cluster.">Mountains</LabelWithTooltip>
                <span className="text-xs text-muted-foreground">{pctLabel(mountainChance, 'None', 'Always')}</span>
              </div>
              <Slider
                min={0} max={1} step={0.01}
                value={[mountainChance]}
                onValueChange={([v]) => onMountainChanceChange(v)}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <LabelWithTooltip tooltip="Chance of a pool in the cluster. Higher chance allows a smaller brush (down to 3×3).">
                  Pools
                </LabelWithTooltip>
                <span className="text-xs text-muted-foreground">{pctLabel(poolChance, 'None', 'High')}</span>
              </div>
              <Slider
                min={0} max={1} step={0.01}
                value={[poolChance]}
                onValueChange={([v]) => onPoolChanceChange(v)}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <LabelWithTooltip
              tooltip={`How much ${tool === 'obstacles' ? 'obstacle types' : tool === 'trees' ? 'tree types' : 'picks'} vary from other biomes vs. only the biome painted on.`}
            >
              Biome mix
            </LabelWithTooltip>
            <span className="text-xs text-muted-foreground">
              {biomePurity >= 1 ? 'This biome only' : biomePurity <= 0 ? 'All biomes' : `${Math.round(biomePurity * 100)}% pure`}
            </span>
          </div>
          <Slider
            min={0} max={1} step={0.01}
            value={[biomePurity]}
            onValueChange={([v]) => onBiomePurityChange(v)}
          />
        </div>

        <div className="flex items-center justify-between">
          <LabelWithTooltip
            htmlFor={`${tool}-high-contrast`}
            tooltip="When off, a cross-biome pick only lands on a visually compatible biome — Grass/Sand/Autumn/Dirt mix freely with each other, but Snow, Lava, and Deathland never mix with any other biome."
          >
            Allow high-contrast biomes
          </LabelWithTooltip>
          <Switch
            id={`${tool}-high-contrast`}
            checked={allowHighContrastBiomes}
            onCheckedChange={onAllowHighContrastBiomesChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
