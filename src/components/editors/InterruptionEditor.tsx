import { useScenarioStore } from '@/store/useScenarioStore'
import type { Interruption } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import ActionList from '@/components/actions/ActionList'

const KNOWN_INTERRUPTION_TYPES = ['BeforeIamVsHero', 'AfterIamWinVsHero', 'BeforeHeroVsHero', 'AfterHeroWinVsHero']

interface Props {
  index: number
  interruption: Interruption
}

export default function InterruptionEditor({ index, interruption }: Props) {
  const {
    updateInterruption,
    addInterruptionAction,
    updateInterruptionAction,
    removeInterruptionAction,
  } = useScenarioStore()

  if (!interruption) return null

  const update = (patch: Partial<Interruption>) =>
    updateInterruption(index, { ...interruption, ...patch })

  const isCustomType = !KNOWN_INTERRUPTION_TYPES.includes(interruption.interruption)

  const addParam = () => update({ p: [...interruption.p, ''] })
  const updateParam = (i: number, val: string) => {
    const p = [...interruption.p]
    p[i] = val
    update({ p })
  }
  const removeParam = (i: number) =>
    update({ p: interruption.p.filter((_, j) => j !== i) })

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Interruption
      </h2>

      <div className="space-y-1">
        <Label>SID</Label>
        <Input
          value={interruption.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder="e.g. interaction_with_demon_hero_6"
        />
      </div>

      <div className="space-y-1">
        <Label>Type</Label>
        <div className="flex gap-2">
          <Select
            value={isCustomType ? '__custom__' : interruption.interruption}
            onValueChange={(v) => {
              if (v !== '__custom__') update({ interruption: v })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWN_INTERRUPTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Custom…</SelectItem>
            </SelectContent>
          </Select>
          {isCustomType && (
            <Input
              value={interruption.interruption}
              onChange={(e) => update({ interruption: e.target.value })}
              placeholder="Custom type"
              className="flex-1"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="intr-active"
          checked={interruption.activeOnStart}
          onCheckedChange={(v) => update({ activeOnStart: !!v })}
        />
        <Label htmlFor="intr-active">Active on start</Label>
      </div>

      {/* Parameters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Parameters (p)</Label>
          <Button variant="ghost" size="sm" onClick={addParam} className="h-6 gap-1 text-xs">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        {interruption.p.map((val, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={val}
              onChange={(e) => updateParam(i, e.target.value)}
              placeholder={`Param ${i + 1} (e.g. hero entity ID)`}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => removeParam(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {interruption.p.length === 0 && (
          <p className="text-xs text-muted-foreground">No parameters.</p>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Label>Actions</Label>
        <ActionList
          actions={interruption.actions}
          onAdd={() => addInterruptionAction(index)}
          onUpdate={(ai, action) => updateInterruptionAction(index, ai, action)}
          onRemove={(ai) => removeInterruptionAction(index, ai)}
        />
      </div>
    </div>
  )
}
