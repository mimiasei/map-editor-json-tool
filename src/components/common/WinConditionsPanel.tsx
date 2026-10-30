import { Plus, Minus } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import FieldInfo from '@/components/common/FieldInfo'
import DurationField from '@/components/common/DurationField'
import type { ClassicSettings } from '@/lib/rmg/classic-presets'
import { DEFAULT_WIN_OPTIONS, WIN_CONDITIONS, addTournamentFights, removeTournamentFights, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'
import { useTranslation } from 'react-i18next'

interface Props {
  settings: ClassicSettings
  onChange: (update: (prev: ClassicSettings) => ClassicSettings) => void
  disabled?: boolean
}

export default function WinConditionsPanel({ settings, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const active = settings.winConditions ?? ['classic']
  const options = settings.winOptions ?? DEFAULT_WIN_OPTIONS
  const setOptions = (patch: Partial<WinOptions>) => onChange((prev) => ({ ...prev, winOptions: { ...(prev.winOptions ?? DEFAULT_WIN_OPTIONS), ...patch } }))
  const toggle = (id: WinConditionId, on: boolean) => onChange((prev) => {
    const cur = prev.winConditions ?? ['classic']
    const next = on ? [...cur, id] : cur.filter((c) => c !== id)
    return { ...prev, winConditions: next.length === 1 && next[0] === 'classic' ? undefined : next }
  })
  const fights = options.tournamentFights
  const setFight = (i: number, patch: Partial<(typeof fights)[number]>) =>
    setOptions({ tournamentFights: fights.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{t('common.winConditionsPanel.winConditions')}</Label>
        <FieldInfo text={t('common.winConditionsPanel.whichWaysTheGeneratedMap')} />
      </div>
      {WIN_CONDITIONS.map((wc) => {
        const on = active.includes(wc.id)
        return (
          <div key={wc.id} className="space-y-2">
            <div className="flex items-center justify-between" title={t(`common.winConditionsPanel.conditions.${wc.id}.description`)}>
              <div className="flex items-center gap-1">
                <Label htmlFor={`rmg-win-${wc.id}`} className="text-xs">{t(`common.winConditionsPanel.conditions.${wc.id}.label`)}</Label>
                <FieldInfo text={t(`common.winConditionsPanel.conditions.${wc.id}.details`)} />
              </div>
              <Switch id={`rmg-win-${wc.id}`} checked={on} onCheckedChange={(v) => toggle(wc.id, v)} disabled={disabled || (on && active.length === 1)} />
            </div>
            {on && wc.id === 'capital-hold' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label={t('common.winConditionsPanel.timeToRetake')} value={options.capitalHoldDays} onChange={(v) => setOptions({ capitalHoldDays: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'city-hold' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label={t('common.winConditionsPanel.timeToHold')} value={options.cityHoldDays} onChange={(v) => setOptions({ cityHoldDays: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'final-battle' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label={t('common.winConditionsPanel.battleDate')} value={options.finalBattleDay} onChange={(v) => setOptions({ finalBattleDay: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'tournament' && (
              <div className="pl-3 space-y-1.5">
                <p className="text-xs font-medium text-center">{t('common.winConditionsPanel.bestOf', { length: fights.length })}</p>
                {fights.map((fight, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                    <span className="text-xs font-medium">{t('common.winConditionsPanel.battleN', { n: i + 1 })}</span>
                    <DurationField label={t('common.winConditionsPanel.battleDate')} value={fight.announceDay} onChange={(v) => setFight(i, { announceDay: v })} disabled={disabled} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => setOptions({ tournamentFights: addTournamentFights(fights) })}>
                    <Plus className="h-3 w-3 mr-1" />{t('common.winConditionsPanel.add2MoreBattles')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={disabled || fights.length < 3} onClick={() => setOptions({ tournamentFights: removeTournamentFights(fights) })}>
                    <Minus className="h-3 w-3 mr-1" />{t('common.winConditionsPanel.remove2')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
