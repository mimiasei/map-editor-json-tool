import { useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { Trigger } from '@/types/scenario'
import { CONDITION_REGISTRY } from '@/schema/conditions'
import { ACTION_REGISTRY } from '@/schema/actions'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Repeat, X } from 'lucide-react'
import ConditionCard from './ConditionCard'
import ActionCard from './ActionCard'
import AddNodePopover from './AddNodePopover'
import TriggerInspectorPanel, { type SelectedNode } from './TriggerInspectorPanel'
import { cn } from '@/lib/utils'

interface Props {
  questIndex: number
  subQuestIndex: number
  triggerIndex: number
  trigger: Trigger
}

export default function TriggerVisualBuilder({ questIndex, subQuestIndex, triggerIndex, trigger }: Props) {
  const { updateTrigger, addCondition, updateCondition, removeCondition, addAction, updateAction, removeAction } =
    useScenarioStore()

  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [clearConditionsConfirming, setClearConditionsConfirming] = useState(false)
  const [clearActionsConfirming, setClearActionsConfirming] = useState(false)

  const conditions = trigger.conditions
  const actions = trigger.actions
  const logic = trigger.conditionsLogic ?? 'And'
  const firstBreakIndex = actions.findIndex((a) => a.break === true)

  const shiftSelection = (kind: 'condition' | 'action', removedIndex: number) => {
    setSelected((prev) => {
      if (!prev || prev.kind !== kind) return prev
      if (prev.index === removedIndex) return null
      if (prev.index > removedIndex) return { kind, index: prev.index - 1 }
      return prev
    })
  }

  const handleAddCondition = (type: string) => {
    const newIndex = conditions.length
    addCondition(questIndex, subQuestIndex, triggerIndex)
    const def = CONDITION_REGISTRY[type]
    updateCondition(questIndex, subQuestIndex, triggerIndex, newIndex, {
      c: type,
      p: def ? def.params.map(() => '') : [],
    })
    if (!def || def.params.length > 0) setSelected({ kind: 'condition', index: newIndex })
  }

  const handleRemoveCondition = (index: number) => {
    removeCondition(questIndex, subQuestIndex, triggerIndex, index)
    shiftSelection('condition', index)
  }

  const handleAddAction = (type: string) => {
    const newIndex = actions.length
    const def = ACTION_REGISTRY[type]
    addAction(questIndex, subQuestIndex, triggerIndex, { a: type, p: def ? def.params.map(() => '') : [] })
    if (!def || def.params.length > 0) setSelected({ kind: 'action', index: newIndex })
  }

  const handleRemoveAction = (index: number) => {
    removeAction(questIndex, subQuestIndex, triggerIndex, index)
    shiftSelection('action', index)
  }

  const isEmpty = conditions.length === 0 && actions.length === 0

  return (
    <div className="space-y-4">
      {/* Repeats toggle — trigger-level, shared header above both zones */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => updateTrigger(questIndex, subQuestIndex, triggerIndex, { repeat: !(trigger.repeat ?? false) || undefined })}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            trigger.repeat
              ? 'border-primary/40 bg-accent text-accent-foreground'
              : 'border-border bg-transparent text-muted-foreground hover:bg-accent/50',
          )}
          title="This rule can fire more than once"
        >
          <Repeat className="h-3 w-3" />
          Repeats
        </button>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
          <p className="text-sm font-medium">This rule doesn't do anything yet.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <AddNodePopover kind="condition" onPick={handleAddCondition}>
              <Button variant="outline" size="lg" className="gap-1.5 rounded-xl border-amber-300/70">
                <Plus className="h-4 w-4" />
                Add a condition <span className="text-muted-foreground">(the "when")</span>
              </Button>
            </AddNodePopover>
            <AddNodePopover kind="action" onPick={handleAddAction}>
              <Button variant="outline" size="lg" className="gap-1.5 rounded-xl border-teal-300/70">
                <Plus className="h-4 w-4" />
                Add an action <span className="text-muted-foreground">(the "then")</span>
              </Button>
            </AddNodePopover>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Tip: it's fine to start with just an action — no conditions means it fires every time it's checked.
          </p>
        </div>
      ) : (
        <>
          {/* WHEN zone */}
          <div className="rounded-2xl bg-amber-50/60 p-4 dark:bg-amber-950/10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
                When
              </span>
              <div className="flex items-center gap-2">
                {conditions.length >= 2 && (
                  <Select
                    value={logic}
                    onValueChange={(v) => updateTrigger(questIndex, subQuestIndex, triggerIndex, { conditionsLogic: v as 'And' | 'Or' })}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1.5 rounded-full border-amber-300/70 bg-card px-3 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="And">ALL of these are true</SelectItem>
                      <SelectItem value="Or">ANY of these are true</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {conditions.length >= 2 &&
                  (clearConditionsConfirming ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-destructive">Clear all?</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          updateTrigger(questIndex, subQuestIndex, triggerIndex, { conditions: [] })
                          setClearConditionsConfirming(false)
                          setSelected(null)
                        }}
                      >
                        Confirm
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setClearConditionsConfirming(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setClearConditionsConfirming(true)}
                    >
                      <X className="h-3 w-3" />
                      Clear all
                    </Button>
                  ))}
              </div>
            </div>

            {conditions.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                No conditions yet — this will fire every time it's checked.
              </p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                {conditions.map((condition, i) => (
                  <div key={i} className="flex flex-col items-start gap-2">
                    {i > 0 && (
                      <span className="pl-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700/80 dark:text-amber-400/80">
                        {logic === 'And' ? 'AND' : 'OR'}
                      </span>
                    )}
                    <ConditionCard
                      condition={condition}
                      onEdit={() => setSelected({ kind: 'condition', index: i })}
                      onRemove={() => handleRemoveCondition(i)}
                    />
                  </div>
                ))}
              </div>
            )}

            <AddNodePopover kind="condition" onPick={handleAddCondition}>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-amber-300/70 px-3 py-1.5 text-xs text-amber-800/80 transition-colors hover:bg-amber-100/50 dark:text-amber-300/80 dark:hover:bg-amber-950/20"
              >
                <Plus className="h-3 w-3" />
                Add condition
              </button>
            </AddNodePopover>
          </div>

          {/* THEN zone */}
          <div className="rounded-2xl bg-teal-50/60 p-4 dark:bg-teal-950/10">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-800/80 dark:text-teal-300/80">
                Then, in order
              </span>
              {actions.length >= 2 &&
                (clearActionsConfirming ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-destructive">Clear all?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        updateTrigger(questIndex, subQuestIndex, triggerIndex, { actions: [] })
                        setClearActionsConfirming(false)
                        setSelected(null)
                      }}
                    >
                      Confirm
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setClearActionsConfirming(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setClearActionsConfirming(true)}
                  >
                    <X className="h-3 w-3" />
                    Clear all
                  </Button>
                ))}
            </div>

            {actions.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">No actions yet.</p>
            ) : (
              <div className="space-y-2">
                {actions.map((action, i) => (
                  <ActionCard
                    key={i}
                    action={action}
                    index={i}
                    dimmed={firstBreakIndex >= 0 && i > firstBreakIndex}
                    onEdit={() => setSelected({ kind: 'action', index: i })}
                    onRemove={() => handleRemoveAction(i)}
                  />
                ))}
              </div>
            )}

            <AddNodePopover kind="action" onPick={handleAddAction}>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-teal-300/70 px-3 py-1.5 text-xs text-teal-800/80 transition-colors hover:bg-teal-100/50 dark:text-teal-300/80 dark:hover:bg-teal-950/20"
              >
                <Plus className="h-3 w-3" />
                Add action
              </button>
            </AddNodePopover>
          </div>
        </>
      )}

      <TriggerInspectorPanel
        trigger={trigger}
        selected={selected}
        onClose={() => setSelected(null)}
        onUpdateCondition={(i, c) => updateCondition(questIndex, subQuestIndex, triggerIndex, i, c)}
        onRemoveCondition={handleRemoveCondition}
        onUpdateAction={(i, a) => updateAction(questIndex, subQuestIndex, triggerIndex, i, a)}
        onRemoveAction={handleRemoveAction}
      />
    </div>
  )
}
