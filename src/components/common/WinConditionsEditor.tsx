// ─── Win condition editor ─────────────────────────────────────────────────────
// The list of win conditions with their settings, shared by the Generate Random Map dialog (WinConditionsPanel) and the Map Grid's map
// settings. It only shows and reports changes: where the values live (generator settings, or the map itself) is the caller's business.

import type { ReactNode } from 'react'
import { Plus, Minus } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import FieldInfo from '@/components/common/FieldInfo'
import DurationField from '@/components/common/DurationField'
import { WIN_CONDITIONS, addTournamentFights, removeTournamentFights, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'
import { useTranslation } from 'react-i18next'

interface Props {
  active: WinConditionId[]
  options: WinOptions
  onActiveChange: (next: WinConditionId[]) => void
  onOptionsChange: (patch: Partial<WinOptions>) => void
  disabled?: boolean
  /** Replaces the hover text of the heading's info icon (the default speaks of the generated map). */
  description?: string
  /** Prefix of the switch ids, so two editors on one page do not share them. */
  idPrefix?: string
  /** Shown under City Hold when it is on (the Map Grid puts its city picker here). */
  cityHoldExtra?: ReactNode
  /** Switches that cannot be turned on (with the reason as a hover text), e.g. City Hold on a map with no neutral city. */
  unavailable?: Partial<Record<WinConditionId, string>>
}

export default function WinConditionsEditor({ active, options, onActiveChange, onOptionsChange, disabled, description, idPrefix = 'win', cityHoldExtra, unavailable }: Props) {
  const { t } = useTranslation()
  const setOptions = onOptionsChange
  const toggle = (id: WinConditionId, on: boolean) => onActiveChange(on ? [...active, id] : active.filter((c) => c !== id))
  const fights = options.tournamentFights
  const setFight = (i: number, patch: Partial<(typeof fights)[number]>) =>
    setOptions({ tournamentFights: fights.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{t('common.winConditionsPanel.winConditions')}</Label>
        <FieldInfo text={description ?? t('common.winConditionsPanel.whichWaysTheGeneratedMap')} />
      </div>
      {WIN_CONDITIONS.map((wc) => {
        const on = active.includes(wc.id)
        return (
          <div key={wc.id} className="space-y-2">
            <div className="flex items-center justify-between" title={t(`common.winConditionsPanel.conditions.${wc.id}.description`)}>
              <div className="flex items-center gap-1">
                <Label htmlFor={`${idPrefix}-${wc.id}`} className="text-xs">{t(`common.winConditionsPanel.conditions.${wc.id}.label`)}</Label>
                <FieldInfo text={t(`common.winConditionsPanel.conditions.${wc.id}.details`)} />
              </div>
              <Switch id={`${idPrefix}-${wc.id}`} checked={on} onCheckedChange={(v) => toggle(wc.id, v)} disabled={disabled || (on && active.length === 1) || (!on && !!unavailable?.[wc.id])} title={!on ? unavailable?.[wc.id] : undefined} />
            </div>
            {on && wc.id === 'capital-hold' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label={t('common.winConditionsPanel.timeToRetake')} value={options.capitalHoldDays} onChange={(v) => setOptions({ capitalHoldDays: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'city-hold' && (
              <div className="pl-3 space-y-1.5">
                {cityHoldExtra}
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
