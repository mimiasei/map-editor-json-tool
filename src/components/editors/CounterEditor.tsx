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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="counter-min">Min value</Label>
          <Input
            id="counter-min"
            type="number"
            value={counter.minValue ?? ''}
            onChange={(e) =>
              update({ minValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder="No lower bound"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="counter-max">Max value</Label>
          <Input
            id="counter-max"
            type="number"
            value={counter.maxValue ?? ''}
            onChange={(e) =>
              update({ maxValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder="No upper bound"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Assigning a value outside this range clamps it to the bound instead.
      </p>

      <div className="space-y-1">
        <Label htmlFor="counter-sharing">Sharing</Label>
        <Input
          id="counter-sharing"
          value={counter.sharing ?? ''}
          onChange={(e) => update({ sharing: e.target.value || undefined })}
          placeholder="e.g. Clone"
        />
        <p className="text-xs text-muted-foreground">
          Visibility scope — makes the counter accessible to all quests with the same sharing value.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="counter-comment">Developer comment</Label>
        <Input
          id="counter-comment"
          value={counter.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder="Optional note (not used by game engine)"
        />
      </div>
    </div>
  )
}
