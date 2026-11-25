// ─── Map Grid — the settings of a brush tool, in a ToolToaster ────────────────
// One panel for every painting tool, replacing what used to be spread over the toolbar while a tool was armed (Brush/Bucket, the type
// picker, Mode, Size, Disperse and the settings popover). A tool passes only the sections it has; its own sliders and switches come in
// as children.

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Slider } from '@/components/ui/slider'
import { Freehand, RectSelect } from '@/components/ui/icons'
import ToolToaster from './ToolToaster'

export interface PaintKind {
  value: string | number
  label: string
  title?: string
  /** A colour dot before the label (biome, road, zone). */
  swatch?: string
}

interface Props {
  title: string
  onClose: () => void
  /** The tool's own type choice (biome, level, road, water, city/hero, zone). */
  kinds?: { options: PaintKind[]; value: string | number; onChange: (value: string | number) => void }
  /** Brush | Bucket. */
  bucket?: { value: boolean; onChange: (value: boolean) => void; brushTitle: string; bucketTitle: string }
  /** Freehand | Rectangle (the shared drag mode). */
  shape?: { value: 'freehand' | 'rectangle'; onChange: (value: 'freehand' | 'rectangle') => void }
  /** Size and Disperse, for a freehand brush. */
  brush?: { radius: number; onRadius: (v: number) => void; disperse: number; onDisperse: (v: number) => void }
  /** Tiles drawn but not yet committed, when the tool stages them. */
  staged?: number
  children?: ReactNode
}

const SEGMENT = 'flex h-7 items-center justify-center gap-1.5 px-2 text-xs transition-colors'
const segmentClass = (on: boolean) => `${SEGMENT} ${on ? 'bg-secondary font-medium text-secondary-foreground' : 'text-foreground/60 hover:bg-accent'}`

function SliderRow({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  )
}

export default function PaintToaster({ title, onClose, kinds, bucket, shape, brush, staged, children }: Props) {
  const { t } = useTranslation()
  const bucketOn = bucket?.value ?? false
  const showShape = !!shape && !bucketOn
  const showBrush = !!brush && !bucketOn && shape?.value !== 'rectangle'

  return (
    <ToolToaster title={title} closeTitle={t('mapGrid.mapGridDialog.stopEsc')} onClose={onClose}>
      {kinds && (
        <div className="flex flex-wrap gap-1">
          {kinds.options.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kinds.value === k.value}
              title={k.title}
              onClick={() => kinds.onChange(k.value)}
              className={`flex h-7 items-center gap-1.5 rounded border px-2 text-xs transition-colors ${kinds.value === k.value ? 'border-border bg-secondary font-medium text-secondary-foreground' : 'border-transparent text-foreground/60 hover:bg-accent'}`}
            >
              {k.swatch && <span className="inline-block h-2.5 w-2.5 rounded-full border border-border/50" style={{ backgroundColor: k.swatch }} />}
              {k.label}
            </button>
          ))}
        </div>
      )}

      {bucket && (
        <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
          <button type="button" aria-pressed={!bucket.value} className={segmentClass(!bucket.value)} title={bucket.brushTitle} onClick={() => bucket.onChange(false)}>
            {t('mapGrid.mapGridDialog.brush')}
          </button>
          <button type="button" aria-pressed={bucket.value} className={segmentClass(bucket.value)} title={bucket.bucketTitle} onClick={() => bucket.onChange(true)}>
            {t('mapGrid.mapGridDialog.bucket')}
          </button>
        </div>
      )}

      {showShape && shape && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
            <button type="button" aria-pressed={shape.value === 'freehand'} className={segmentClass(shape.value === 'freehand')} title={t('mapGrid.mapGridDialog.dragToPaintTileBy')} onClick={() => shape.onChange('freehand')}>
              <Freehand className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.shapeFreehand')}
            </button>
            <button type="button" aria-pressed={shape.value === 'rectangle'} className={segmentClass(shape.value === 'rectangle')} title={t('mapGrid.mapGridDialog.dragARectangleShiftSquare')} onClick={() => shape.onChange('rectangle')}>
              <RectSelect className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.shapeRectangle')}
            </button>
          </div>
          {shape.value === 'rectangle' && (
            <p className="text-muted-foreground">{t('mapGrid.mapGridDialog.rectHint.square')} · {t('mapGrid.mapGridDialog.rectHint.fromCentre')}</p>
          )}
        </div>
      )}

      {showBrush && brush && (
        <>
          <SliderRow label={t('mapGrid.mapGridDialog.size')} value={String(brush.radius)}>
            <Slider min={1} max={15} step={1} value={[brush.radius]} onValueChange={([v]) => brush.onRadius(v)} />
          </SliderRow>
          <SliderRow label={t('mapGrid.mapGridDialog.disperse')} value={`${Math.round(brush.disperse * 100)}%`}>
            <Slider min={0} max={1} step={0.1} value={[brush.disperse]} onValueChange={([v]) => brush.onDisperse(Math.round(v * 10) / 10)} />
          </SliderRow>
        </>
      )}

      {children}

      {!!staged && staged > 0 && <p className="text-amber-600">{t('mapGrid.mapGridDialog.staged', { size: staged })}</p>}
    </ToolToaster>
  )
}
