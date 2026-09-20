import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import ConditionList from '@/components/conditions/ConditionList'
import ActionList from '@/components/actions/ActionList'
import TriggerVisualBuilder from '@/components/triggers/TriggerVisualBuilder'
import { cn } from '@/lib/utils'

interface Props {
  questIndex: number
  subQuestIndex: number
  triggerIndex: number
  trigger: Trigger
}

type ViewMode = 'form' | 'card'

const VIEW_MODE_KEY = 'tse.triggerEditorViewMode'

function readViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    return stored === 'card' ? 'card' : 'form'
  } catch {
    return 'card'
  }
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

  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)

  const setMode = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // view mode preference is a convenience, not required for the feature to work
    }
  }

  if (!trigger) return null

  const update = (patch: Partial<Trigger>) =>
    updateTrigger(questIndex, subQuestIndex, triggerIndex, patch)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Trigger
        </h2>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            variant={viewMode === 'card' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-6 rounded-md px-2 text-xs', viewMode !== 'card' && 'text-muted-foreground')}
            onClick={() => setMode('card')}
          >
            Card view
          </Button>
          <Button
            variant={viewMode === 'form' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-6 rounded-md px-2 text-xs', viewMode !== 'form' && 'text-muted-foreground')}
            onClick={() => setMode('form')}
          >
            Form view
          </Button>
        </div>
      </div>

      {viewMode === 'card' ? (
        <TriggerVisualBuilder
          questIndex={questIndex}
          subQuestIndex={subQuestIndex}
          triggerIndex={triggerIndex}
          trigger={trigger}
        />
      ) : (
        <>
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
              onAdd={(action) => addAction(questIndex, subQuestIndex, triggerIndex, action)}
              onUpdate={(ai, action) =>
                updateAction(questIndex, subQuestIndex, triggerIndex, ai, action)
              }
              onRemove={(ai) => removeAction(questIndex, subQuestIndex, triggerIndex, ai)}
            />
          </div>
        </>
      )}
    </div>
  )
}
