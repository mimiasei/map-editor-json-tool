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
import { useTranslation } from 'react-i18next'

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
    return stored === 'form' ? 'form' : 'card'
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
  const { t } = useTranslation()
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
          {t('editors.triggerEditor.trigger')}
        </h2>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <Button
            variant={viewMode === 'card' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-6 rounded-md px-2 text-xs', viewMode !== 'card' && 'text-muted-foreground')}
            onClick={() => setMode('card')}
          >
            {t('editors.triggerEditor.cardView')}
          </Button>
          <Button
            variant={viewMode === 'form' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-6 rounded-md px-2 text-xs', viewMode !== 'form' && 'text-muted-foreground')}
            onClick={() => setMode('form')}
          >
            {t('editors.triggerEditor.formView')}
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
              <Label>{t('editors.triggerEditor.conditionsLogic')}</Label>
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
                  <SelectItem value="And">{t('dialogs.dialogEditor.and')}</SelectItem>
                  <SelectItem value="Or">{t('dialogs.dialogEditor.or')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id="trigger-repeat"
                checked={trigger.repeat ?? false}
                onCheckedChange={(v) => update({ repeat: !!v || undefined })}
              />
              <Label htmlFor="trigger-repeat">{t('editors.triggerEditor.repeatCanFireMultipleTimes')}</Label>
            </div>
          </div>

          <Separator />

          {/* Conditions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('editors.triggerEditor.conditions')}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('editors.triggerEditor.whenToFire')}
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
              {t('editors.triggerEditor.actions')}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('editors.triggerEditor.whatToDo')}
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
