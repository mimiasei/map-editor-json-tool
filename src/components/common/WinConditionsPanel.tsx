import { Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import FieldInfo from '@/components/common/FieldInfo'
import DurationField from '@/components/common/DurationField'
import type { ClassicSettings } from '@/lib/rmg/classic-presets'
import { DEFAULT_WIN_OPTIONS, WIN_CONDITIONS, addTournamentFights, removeTournamentFights, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'

interface Props {
  settings: ClassicSettings
  onChange: (update: (prev: ClassicSettings) => ClassicSettings) => void
  disabled?: boolean
}

function SwitchField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

export default function WinConditionsPanel({ settings, onChange, disabled }: Props) {
  const active = settings.winConditions ?? ['classic']
  const options = settings.winOptions ?? DEFAULT_WIN_OPTIONS
  const setOptions = (patch: Partial<WinOptions>) => onChange((prev) => ({ ...prev, winOptions: { ...(prev.winOptions ?? DEFAULT_WIN_OPTIONS), ...patch } }))
  const toggle = (id: WinConditionId, on: boolean) => onChange((prev) => {
    const cur = prev.winConditions ?? ['classic']
    const next = on ? [...cur, id] : cur.filter((c) => c !== id)
    return { ...prev, winConditions: next.length === 1 && next[0] === 'classic' ? undefined : next }
  })
  const fb = options.finalBattle
  const fights = options.tournamentFights
  const setFight = (i: number, patch: Partial<(typeof fights)[number]>) =>
    setOptions({ tournamentFights: fights.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Label className="text-xs">Win conditions</Label>
        <FieldInfo text="Which ways the generated map can be won. Several can be on at once; at least one stays on. Default is Classic only." />
      </div>
      {WIN_CONDITIONS.map((wc) => {
        const on = active.includes(wc.id)
        return (
          <div key={wc.id} className="space-y-2">
            <div className="flex items-center justify-between" title={wc.description}>
              <div className="flex items-center gap-1">
                <Label htmlFor={`rmg-win-${wc.id}`} className="text-xs">{wc.label}</Label>
                <FieldInfo text={wc.details} />
              </div>
              <Switch id={`rmg-win-${wc.id}`} checked={on} onCheckedChange={(v) => toggle(wc.id, v)} disabled={disabled || (on && active.length === 1)} />
            </div>
            {on && wc.id === 'capital-hold' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label="Time to retake" value={options.capitalHoldDays} onChange={(v) => setOptions({ capitalHoldDays: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'city-hold' && (
              <div className="pl-3 space-y-1.5">
                <DurationField label="Time to hold" value={options.cityHoldDays} onChange={(v) => setOptions({ cityHoldDays: v })} disabled={disabled} />
                <SwitchField label="Reset cooldown" checked={options.cityHoldResetCooldown} onChange={(v) => setOptions({ cityHoldResetCooldown: v })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'final-battle' && (
              <div className="pl-3 space-y-1.5">
                <SwitchField label="Registration start work" checked={fb.registrationStartWork} onChange={(v) => setOptions({ finalBattle: { ...fb, registrationStartWork: v } })} disabled={disabled} />
                <SwitchField label="Registration start fight" checked={fb.registrationStartFight} onChange={(v) => setOptions({ finalBattle: { ...fb, registrationStartFight: v } })} disabled={disabled} />
                <DurationField label="Start delay" value={fb.daysDelayStart} onChange={(v) => setOptions({ finalBattle: { ...fb, daysDelayStart: v } })} disabled={disabled} />
                <DurationField label="Count day" value={fb.countDay} onChange={(v) => setOptions({ finalBattle: { ...fb, countDay: v } })} disabled={disabled} />
              </div>
            )}
            {on && wc.id === 'tournament' && (
              <div className="pl-3 space-y-1.5">
                <SwitchField label="Save army" checked={options.tournamentSaveArmy} onChange={(v) => setOptions({ tournamentSaveArmy: v })} disabled={disabled} />
                {fights.map((fight, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                    <span className="text-xs font-medium">Fight {i + 1}</span>
                    <DurationField label="Announce day" value={fight.announceDay} onChange={(v) => setFight(i, { announceDay: v })} disabled={disabled} />
                    <DurationField label="Length" value={fight.days} onChange={(v) => setFight(i, { days: v })} disabled={disabled} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={() => setOptions({ tournamentFights: addTournamentFights(fights) })}>
                    <Plus className="h-3 w-3 mr-1" />Add 2 fights
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={disabled || fights.length < 3} onClick={() => setOptions({ tournamentFights: removeTournamentFights(fights) })}>
                    <Minus className="h-3 w-3 mr-1" />Remove 2
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
