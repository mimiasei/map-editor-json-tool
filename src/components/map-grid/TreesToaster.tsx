// ─── Map Grid — the Trees / Walkables brush, in a ToolToaster ─────────────────
// Everything the brush has used to spread over the toolbar (Brush/Bucket, Mode, Size, Disperse and the settings popover) in one panel. Both
// kinds use it: the Walkables brush is the Trees brush fed ground cover, so it only adds the Grass slider.

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Freehand, RectSelect } from '@/components/ui/icons'
import ToolToaster from './ToolToaster'

interface Props {
  kind: 'trees' | 'flowers'
  bucket: boolean
  onBucket: (bucket: boolean) => void
  shape: 'freehand' | 'rectangle'
  onShape: (shape: 'freehand' | 'rectangle') => void
  radius: number
  onRadius: (radius: number) => void
  disperse: number
  onDisperse: (disperse: number) => void
  biomePurity: number
  onBiomePurity: (value: number) => void
  allowHighContrast: boolean
  onAllowHighContrast: (value: boolean) => void
  grassChance: number
  onGrassChance: (value: number) => void
  onClose: () => void
}

const SEGMENT = 'flex h-7 items-center justify-center gap-1.5 text-xs transition-colors'
const segmentClass = (on: boolean) => `${SEGMENT} ${on ? 'bg-secondary font-medium text-secondary-foreground' : 'text-foreground/60 hover:bg-accent'}`

function Row({ label, value, tip, children }: { label: string; value: string; tip?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs" title={tip}>{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  )
}

export default function TreesToaster(p: Props) {
  const { t } = useTranslation()
  const purity = p.biomePurity >= 1 ? t('mapGrid.toolBrushSettingsPopover.thisBiomeOnly') : p.biomePurity <= 0 ? t('mapGrid.toolBrushSettingsPopover.allBiomes') : `${Math.round(p.biomePurity * 100)}%`
  const freehand = !p.bucket && p.shape === 'freehand'

  return (
    <ToolToaster
      title={t(p.kind === 'flowers' ? 'mapGrid.mapGridDialog.walkables' : 'mapGrid.mapGridDialog.trees')}
      closeTitle={t('mapGrid.mapGridDialog.stopEsc')}
      onClose={p.onClose}
    >
      <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
        <button type="button" aria-pressed={!p.bucket} className={segmentClass(!p.bucket)} title={t('mapGrid.mapGridDialog.freehandBrushDragToScatter')} onClick={() => p.onBucket(false)}>
          {t('mapGrid.mapGridDialog.brush')}
        </button>
        <button type="button" aria-pressed={p.bucket} className={segmentClass(p.bucket)} title={t('mapGrid.mapGridDialog.bucketFillClickToScatter')} onClick={() => p.onBucket(true)}>
          {t('mapGrid.mapGridDialog.bucket')}
        </button>
      </div>

      {!p.bucket && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
            <button type="button" aria-pressed={p.shape === 'freehand'} className={segmentClass(p.shape === 'freehand')} title={t('mapGrid.mapGridDialog.dragToPaintTileBy')} onClick={() => p.onShape('freehand')}>
              <Freehand className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.shapeFreehand')}
            </button>
            <button type="button" aria-pressed={p.shape === 'rectangle'} className={segmentClass(p.shape === 'rectangle')} title={t('mapGrid.mapGridDialog.dragARectangleShiftSquare')} onClick={() => p.onShape('rectangle')}>
              <RectSelect className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.shapeRectangle')}
            </button>
          </div>
          {p.shape === 'rectangle' && (
            <p className="text-muted-foreground">{t('mapGrid.mapGridDialog.rectHint.square')} · {t('mapGrid.mapGridDialog.rectHint.fromCentre')}</p>
          )}
        </div>
      )}

      {freehand && (
        <>
          <Row label={t('mapGrid.mapGridDialog.size')} value={String(p.radius)}>
            <Slider min={1} max={15} step={1} value={[p.radius]} onValueChange={([v]) => p.onRadius(v)} />
          </Row>
          <Row label={t('mapGrid.mapGridDialog.disperse')} value={`${Math.round(p.disperse * 100)}%`}>
            <Slider min={0} max={1} step={0.1} value={[p.disperse]} onValueChange={([v]) => p.onDisperse(Math.round(v * 10) / 10)} />
          </Row>
        </>
      )}

      <Row label={t('mapGrid.toolBrushSettingsPopover.biomeMix')} value={purity} tip={t(`mapGrid.toolBrushSettingsPopover.biomeMixTooltip.${p.kind}`)}>
        <Slider min={0} max={1} step={0.01} value={[p.biomePurity]} onValueChange={([v]) => p.onBiomePurity(v)} />
      </Row>

      {p.kind === 'flowers' && (
        <Row label={t('mapGrid.toolBrushSettingsPopover.grass')} value={`${Math.round(p.grassChance * 100)}%`} tip={t('mapGrid.toolBrushSettingsPopover.grassTooltip')}>
          <Slider min={0} max={1} step={0.01} value={[p.grassChance]} onValueChange={([v]) => p.onGrassChance(v)} />
        </Row>
      )}

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="trees-toaster-contrast" className="text-xs" title={t('mapGrid.toolBrushSettingsPopover.whenOffACrossBiome')}>
          {t('mapGrid.toolBrushSettingsPopover.allowHighContrastBiomes')}
        </Label>
        <Switch id="trees-toaster-contrast" checked={p.allowHighContrast} onCheckedChange={p.onAllowHighContrast} />
      </div>
    </ToolToaster>
  )
}
