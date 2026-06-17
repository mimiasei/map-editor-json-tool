import { useScenarioStore } from '@/store/useScenarioStore'
import type { Counter } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  index: number
  counter: Counter
}

export default function CounterEditor({ index, counter }: Props) {
  const { updateCounter } = useScenarioStore()

  if (!counter) return null

  const update = (patch: Partial<Counter>) =>
    updateCounter(index, { ...counter, ...patch })

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Counter
      </h2>

      <div className="space-y-1">
        <Label htmlFor="counter-sid">SID</Label>
        <Input
          id="counter-sid"
          value={counter.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder="e.g. main_quest_stage"
        />
        <p className="text-xs text-muted-foreground">
          Unique identifier. Referenced by Counter conditions and CounterPlus / CounterSetRandom actions.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="counter-value">Initial value</Label>
        <Input
          id="counter-value"
          type="number"
          value={counter.value}
          onChange={(e) => update({ value: Number(e.target.value) })}
          className="w-32"
        />
      </div>
    </div>
  )
}
