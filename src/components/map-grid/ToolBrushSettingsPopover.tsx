// ─── Map Grid — Obstacles/Trees/Interactable/Encounter brush settings popover ─
// Same gear-icon-triggers-a-Popover-of-Sliders pattern as
// MapGridSettingsDialog.tsx, placed to the left of "Mode: Freehand/
// Rectangle" whenever one of these brushes is the active tool. Content
// depends on which one triggered it — all four share this one popover
// component rather than each getting its own, since only one of them is
// ever active at a time.

import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Settings } from '@/components/ui/icons'
import { DEFAULT_SQUAD_DIFFICULTY_RANGES, squadDifficultyName, type DifficultyRange } from '@/lib/map-grid/squad-pool'
import { useTranslation } from 'react-i18next'

interface Props {
  tool: 'obstacles' | 'trees' | 'flowers' | 'interactable' | 'squad' | 'resource'
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
  /** All four tools — 0 mixes in other biomes freely, 1 only ever uses the
   *  biome actually painted on (for Encounter, "biome" means the
   *  propRandomSquads.fraction its tile's biome maps to — see squad-pool.ts). */
  biomePurity: number
  onBiomePurityChange: (value: number) => void
  /** Walkables only — chance a placed walkable is actual grass rather than flowers/mushrooms (0 = none, 1 = only grass). */
  grassChance: number
  onGrassChanceChange: (value: number) => void
  /** Obstacles/Trees/Interactable only — whether a cross-biome pick can land
   *  on a visually jarring biome (Snow decorations on Grass, Lava objects
   *  anywhere else, etc. — see areBiomesCompatible, fuzzy-obstacle.ts). Not
   *  applicable to Encounter — a faction roster mismatch isn't a visual
   *  clash the same way, and issue #203 didn't ask for it. */
  allowHighContrastBiomes: boolean
  onAllowHighContrastBiomesChange: (value: boolean) => void
  /** Encounter only — the enabled RANDOM_SQUAD_DIFFICULTY_RANGES labels
   *  (squad-pool.ts); each placement picks one at random. 'Random' is
   *  mutually exclusive with the rest — enforced by the toggle handler in
   *  MapGridDialog.tsx, not here. */
  squadDifficulties: string[]
  onToggleSquadDifficulty: (label: string) => void
  /** The (possibly user-customized, Map Grid settings' Advanced section)
   *  live difficulty list — just used here for the pill labels/order. */
  squadDifficultyRanges?: DifficultyRange[]
  /** Encounter only — also place a random-res pickup on the tile directly
   *  north of the squad (auto-generates a resource with a guard). */
  squadPlaceResourceAbove: boolean
  onSquadPlaceResourceAboveChange: (value: boolean) => void
  /** Resource only — also place a random-squad guard on the tile directly
   *  south of the resource (auto-generates a resource with a guard). */
  resourceGuardBelow: boolean
  onResourceGuardBelowChange: (value: boolean) => void
}

function pctLabel(value: number, zeroLabel: string, oneLabel: string): string {
  if (value <= 0) return zeroLabel
  if (value >= 1) return oneLabel
  return `${Math.round(value * 100)}%`
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
  grassChance,
  onGrassChanceChange,
  allowHighContrastBiomes,
  onAllowHighContrastBiomesChange,
  squadDifficulties,
  onToggleSquadDifficulty,
  squadDifficultyRanges = DEFAULT_SQUAD_DIFFICULTY_RANGES,
  squadPlaceResourceAbove,
  onSquadPlaceResourceAboveChange,
  resourceGuardBelow,
  onResourceGuardBelowChange,
}: Props) {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={t(`mapGrid.toolBrushSettingsPopover.titles.${tool}`)}>
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4" data-nodrag>
        {tool === 'obstacles' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <LabelWithTooltip tooltip={t('mapGrid.toolBrushSettingsPopover.chanceOfAMountainIn')}>{t('mapGrid.toolBrushSettingsPopover.mountains')}</LabelWithTooltip>
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
                <LabelWithTooltip tooltip={t('mapGrid.toolBrushSettingsPopover.chanceOfAPoolIn')}>
                  {t('mapGrid.toolBrushSettingsPopover.pools')}
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

        {tool === 'squad' && (
          <div className="space-y-1.5">
            <LabelWithTooltip tooltip={t('mapGrid.toolBrushSettingsPopover.totalArmyValueTheGame')}>
              {t('common.generateRandomMapDialog.difficulty')}
            </LabelWithTooltip>
            {/* Same on/off pill style as the Browse-mode header filters
                (Units/Artifact pickups/...) — user-requested, the previous
                Button variant={secondary/outline} pairing read as
                too-similar-to-tell-apart at this size. */}
            <div className="flex flex-wrap gap-1">
              {squadDifficultyRanges.map(({ label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onToggleSquadDifficulty(label)}
                  className={`h-6 px-2 text-xs rounded shrink-0 border transition-colors ${
                    squadDifficulties.includes(label)
                      ? 'bg-background text-foreground border-border'
                      : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                >
                  {squadDifficultyName(label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {tool === 'resource' && (
          <div className="flex items-center justify-between">
            <LabelWithTooltip
              htmlFor="resource-guard-below"
              tooltip={t('mapGrid.toolBrushSettingsPopover.alsoPlacesARandomSquad')}
            >
              {t('mapGrid.toolBrushSettingsPopover.placeAGuardOnThe')}
            </LabelWithTooltip>
            <Switch
              id="resource-guard-below"
              checked={resourceGuardBelow}
              onCheckedChange={onResourceGuardBelowChange}
            />
          </div>
        )}

        {tool !== 'resource' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <LabelWithTooltip
                  tooltip={t(`mapGrid.toolBrushSettingsPopover.biomeMixTooltip.${tool === 'obstacles' || tool === 'trees' || tool === 'flowers' || tool === 'squad' ? tool : 'other'}`)}
                >
                  {t('mapGrid.toolBrushSettingsPopover.biomeMix')}
                </LabelWithTooltip>
                <span className="text-xs text-muted-foreground">
                  {biomePurity >= 1 ? t('mapGrid.toolBrushSettingsPopover.thisBiomeOnly') : biomePurity <= 0 ? t('mapGrid.toolBrushSettingsPopover.allBiomes') : `${Math.round(biomePurity * 100)}% pure`}
                </span>
              </div>
              <Slider
                min={0} max={1} step={0.01}
                value={[biomePurity]}
                onValueChange={([v]) => onBiomePurityChange(v)}
              />
            </div>
        )}

        {tool === 'flowers' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <LabelWithTooltip tooltip={t('mapGrid.toolBrushSettingsPopover.grassTooltip')}>
                {t('mapGrid.toolBrushSettingsPopover.grass')}
              </LabelWithTooltip>
              <span className="text-xs text-muted-foreground">{Math.round(grassChance * 100)}%</span>
            </div>
            <Slider
              min={0} max={1} step={0.01}
              value={[grassChance]}
              onValueChange={([v]) => onGrassChanceChange(v)}
            />
          </div>
        )}

        {tool !== 'squad' && tool !== 'resource' && (
          <div className="flex items-center justify-between">
            <LabelWithTooltip
              htmlFor={`${tool}-high-contrast`}
              tooltip={t('mapGrid.toolBrushSettingsPopover.whenOffACrossBiome')}
            >
              {t('mapGrid.toolBrushSettingsPopover.allowHighContrastBiomes')}
            </LabelWithTooltip>
            <Switch
              id={`${tool}-high-contrast`}
              checked={allowHighContrastBiomes}
              onCheckedChange={onAllowHighContrastBiomesChange}
            />
          </div>
        )}

        {tool === 'squad' && (
          <div className="flex items-center justify-between">
            <LabelWithTooltip
              htmlFor="squad-resource-above"
              tooltip={t('mapGrid.toolBrushSettingsPopover.alsoPlacesARandomResource')}
            >
              {t('mapGrid.toolBrushSettingsPopover.placeResourceOnTileAbove')}
            </LabelWithTooltip>
            <Switch
              id="squad-resource-above"
              checked={squadPlaceResourceAbove}
              onCheckedChange={onSquadPlaceResourceAboveChange}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
