import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { randomSquadDifficultyLabel, squadDifficultyName, type DifficultyRange } from '@/lib/map-grid/squad-pool'

export interface ScalableEncounter {
  entityType: number
  entityId: number
  value: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The random-squads to offer (the selection when it holds some, else every one on the map). */
  encounters: ScalableEncounter[]
  /** Whether `encounters` is the user's selection rather than the whole map. */
  fromSelection: boolean
  ranges: DifficultyRange[]
  onScale: (entries: { entityType: number; entityId: number; requestedValue: number }[]) => void
}

const DEFAULT_PERCENT = 25
const MAX_PERCENT = 90

/** A value of 0 makes a random-squad never appear in the game (verified), so scaling stops at 1. */
const scaled = (value: number, percent: number) => Math.max(1, Math.round(value * (1 - percent / 100)))

/** Lowers many encounters (random-squads) by a percentage, picked by difficulty band. The X, Cancel and Esc close it without changing
 *  anything; a click outside does not. */
export default function EncounterScalerDialog({ open, onOpenChange, encounters, fromSelection, ranges, onScale }: Props) {
  const { t } = useTranslation()
  const bands = useMemo(() => ranges.filter((r) => r.label !== 'Random').map((r) => r.label), [ranges])
  const bandOf = (value: number) => randomSquadDifficultyLabel(value, ranges)
  // randomSquadDifficultyLabel returns the translated name, so band keys are translated names too.
  const bandKey = (label: string) => squadDifficultyName(label)

  const [percent, setPercent] = useState(DEFAULT_PERCENT)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (open) {
      setPercent(DEFAULT_PERCENT)
      setPicked(new Set(bands.map(bandKey)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const e of encounters) out.set(bandOf(e.value), (out.get(bandOf(e.value)) ?? 0) + 1)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounters, ranges])

  const chosen = encounters.filter((e) => picked.has(bandOf(e.value)))
  const before = chosen.reduce((s, e) => s + e.value, 0)
  const after = chosen.reduce((s, e) => s + scaled(e.value, percent), 0)
  const moved = new Map<string, number>()
  for (const e of chosen) {
    const from = bandOf(e.value)
    const to = bandOf(scaled(e.value, percent))
    if (from !== to) moved.set(`${from} → ${to}`, (moved.get(`${from} → ${to}`) ?? 0) + 1)
  }

  const toggle = (name: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
  const setPercentClamped = (n: number) => setPercent(Math.min(MAX_PERCENT, Math.max(1, Math.round(Number.isFinite(n) ? n : DEFAULT_PERCENT))))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('mapGrid.encounterScaler.title')}</DialogTitle>
          <DialogDescription>
            {t(fromSelection ? 'mapGrid.encounterScaler.introSelection' : 'mapGrid.encounterScaler.introMap', { count: encounters.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.encounterScaler.filter')}</p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPicked(new Set(bands.map(bandKey).filter((n) => counts.has(n))))}>
                {t('mapGrid.encounterScaler.all')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPicked(new Set())}>
                {t('mapGrid.encounterScaler.none')}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bands.map((label) => {
              const name = bandKey(label)
              const count = counts.get(name) ?? 0
              const on = picked.has(name) && count > 0
              return (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={on ? 'default' : 'outline'}
                  className={cn('h-7 text-xs', count === 0 && 'opacity-50')}
                  disabled={count === 0}
                  aria-pressed={on}
                  onClick={() => toggle(name)}
                >
                  {name} ({count})
                </Button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{t('mapGrid.encounterScaler.reduceBy')}</p>
          <div className="flex items-center gap-3">
            <Slider min={1} max={MAX_PERCENT} step={1} value={[percent]} onValueChange={([v]) => setPercentClamped(v)} className="flex-1" />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={MAX_PERCENT}
                value={percent}
                onChange={(e) => setPercentClamped(Number(e.target.value))}
                className="h-7 w-16 text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>{t('mapGrid.encounterScaler.preview', { count: chosen.length, before, after })}</p>
          {[...moved.entries()].map(([label, n]) => (
            <p key={label}>{t('mapGrid.encounterScaler.bandChange', { count: n, change: label })}</p>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" data-skin-large onClick={() => onOpenChange(false)}>
            {t('shared.cancel')}
          </Button>
          <Button
            type="button"
            data-skin-large
            disabled={chosen.length === 0}
            onClick={() => onScale(chosen.map((e) => ({ entityType: e.entityType, entityId: e.entityId, requestedValue: scaled(e.value, percent) })))}
          >
            {t('mapGrid.encounterScaler.scale', { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
