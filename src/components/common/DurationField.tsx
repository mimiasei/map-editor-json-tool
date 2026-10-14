import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** The game's calendar: 7 days to a week, 4 weeks to a month. */
export const DAYS_PER_WEEK = 7
export const WEEKS_PER_MONTH = 4
const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH

const toCount = (raw: string): number => Math.max(0, Math.floor(Number(raw) || 0))

function split(totalDays: number): [number, number, number] {
  return [Math.floor(totalDays / DAYS_PER_MONTH), Math.floor((totalDays % DAYS_PER_MONTH) / DAYS_PER_WEEK), totalDays % DAYS_PER_WEEK]
}

interface Props {
  label: string
  /** Total days; the month/week/day fields are converted to and from this. */
  value: number
  onChange: (days: number) => void
  disabled?: boolean
}

/** A duration entered as months, weeks and days (as the game does), reported as total days. */
export default function DurationField({ label, value, onChange, disabled }: Props) {
  // Local fields so typing "10" in the day box doesn't reflow into weeks mid-edit;
  // they only resync when the value changes from outside.
  const [parts, setParts] = useState<[number, number, number]>(() => split(value))
  useEffect(() => {
    setParts((cur) => (cur[0] * DAYS_PER_MONTH + cur[1] * DAYS_PER_WEEK + cur[2] === value ? cur : split(value)))
  }, [value])

  const update = (index: 0 | 1 | 2, raw: string) => {
    const next: [number, number, number] = [...parts]
    next[index] = toCount(raw)
    setParts(next)
    onChange(next[0] * DAYS_PER_MONTH + next[1] * DAYS_PER_WEEK + next[2])
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {(['Months', 'Weeks', 'Days'] as const).map((unit, i) => (
          <div key={unit} className="flex items-center gap-1">
            <Input type="number" min={0} value={parts[i]} disabled={disabled} onChange={(e) => update(i as 0 | 1 | 2, e.target.value)} className="h-7 min-w-0 text-sm px-2" aria-label={`${label} ${unit.toLowerCase()}`} />
            <span className="text-[10px] text-muted-foreground">{unit[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
