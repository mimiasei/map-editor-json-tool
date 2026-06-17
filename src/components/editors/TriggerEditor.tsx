import { useScenarioStore } from '@/store/useScenarioStore'
import type { Trigger } from '@/types/scenario'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import ConditionList from '@/components/conditions/ConditionList'
import ActionList from '@/components/actions/ActionList'

interface Props {
  questIndex: number
  subQuestIndex: number
  triggerIndex: number
  trigger: Trigger
}

export default function TriggerEditor({
  questIndex,
  subQuestIndex,
  triggerIndex,
  trigger,
}: Props) {
  const {
    updateTrigger,
    addCondition,
    updateCondition,
    removeCondition,
    addAction,
    updateAction,
    removeAction,
  } = useScenarioStore()

  if (!trigger) return null

  const update = (patch: Partial<Trigger>) =>
    updateTrigger(questIndex, subQuestIndex, triggerIndex, patch)

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Trigger
      </h2>

      {/* Logic + repeat */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="space-y-1">
          <Label>Conditions logic</Label>
          <Select
            value={trigger.conditionsLogic ?? 'And'}
            onValueChange={(v) =>
              update({ conditionsLogic: v as 'And' | 'Or' })
            }
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="And">And</SelectItem>
              <SelectItem value="Or">Or</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-5">
          <Checkbox
            id="trigger-repeat"
            checked={trigger.repeat ?? false}
            onCheckedChange={(v) => update({ repeat: !!v || undefined })}
          />
          <Label htmlFor="trigger-repeat">Repeat (can fire multiple times)</Label>
        </div>
      </div>

      <Separator />

      {/* Conditions */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Conditions
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            — when to fire
          </span>
        </Label>
        <ConditionList
          conditions={trigger.conditions}
          onAdd={() => addCondition(questIndex, subQuestIndex, triggerIndex)}
          onUpdate={(ci, condition) =>
            updateCondition(questIndex, subQuestIndex, triggerIndex, ci, condition)
          }
          onRemove={(ci) => removeCondition(questIndex, subQuestIndex, triggerIndex, ci)}
        />
      </div>

      <Separator />

      {/* Actions */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Actions
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            — what to do
          </span>
        </Label>
        <ActionList
          actions={trigger.actions}
          onAdd={() => addAction(questIndex, subQuestIndex, triggerIndex)}
          onUpdate={(ai, action) =>
            updateAction(questIndex, subQuestIndex, triggerIndex, ai, action)
          }
          onRemove={(ai) => removeAction(questIndex, subQuestIndex, triggerIndex, ai)}
        />
      </div>
    </div>
  )
}
