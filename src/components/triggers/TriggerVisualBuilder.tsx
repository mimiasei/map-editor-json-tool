import { useEffect, useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
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
import { Plus, Repeat, Wand2, X } from 'lucide-react'
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

  const pendingSubjectSeed = useViewBridgeStore((s) => s.pendingSubjectSeed)
  const clearSubjectSeed = useViewBridgeStore((s) => s.clearSubjectSeed)
  const pendingResumeSelection = useViewBridgeStore((s) => s.pendingResumeSelection)
  const clearPendingResumeSelection = useViewBridgeStore((s) => s.clearPendingResumeSelection)
  const requestPick = useViewBridgeStore((s) => s.requestPick)

  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [clearConditionsConfirming, setClearConditionsConfirming] = useState(false)
  const [clearActionsConfirming, setClearActionsConfirming] = useState(false)

  // Reopens whichever inspector row was open before a "pick from map" trip —
  // TriggerVisualBuilder fully unmounts while Map Grid is showing, so this
  // local `selected` state doesn't survive the round trip on its own.
  useEffect(() => {
    if (pendingResumeSelection) {
      setSelected(pendingResumeSelection)
      clearPendingResumeSelection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResumeSelection])

  const activeSubjectSeed =
    pendingSubjectSeed &&
    pendingSubjectSeed.path[0] === questIndex &&
    pendingSubjectSeed.path[1] === subQuestIndex &&
    pendingSubjectSeed.path[2] === triggerIndex
      ? pendingSubjectSeed
      : null

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

  const handleAddCondition = (type: string, prefillParamIndex?: number) => {
    const newIndex = conditions.length
    addCondition(questIndex, subQuestIndex, triggerIndex)
    const def = CONDITION_REGISTRY[type]
    const seededValue = activeSubjectSeed?.entitySid ?? ''
    updateCondition(questIndex, subQuestIndex, triggerIndex, newIndex, {
      c: type,
      p: def ? def.params.map((_p, i) => (i === prefillParamIndex ? seededValue : '')) : [],
    })
    if (!def || def.params.length > 0) setSelected({ kind: 'condition', index: newIndex })
  }

  const handleRemoveCondition = (index: number) => {
    removeCondition(questIndex, subQuestIndex, triggerIndex, index)
    shiftSelection('condition', index)
  }

  const handleAddAction = (type: string, prefillParamIndex?: number) => {
    const newIndex = actions.length
    const def = ACTION_REGISTRY[type]
    const seededValue = activeSubjectSeed?.entitySid ?? ''
    addAction(questIndex, subQuestIndex, triggerIndex, {
      a: type,
      p: def ? def.params.map((_p, i) => (i === prefillParamIndex ? seededValue : '')) : [],
    })
    if (!def || def.params.length > 0) setSelected({ kind: 'action', index: newIndex })
  }

  const handleRemoveAction = (index: number) => {
    removeAction(questIndex, subQuestIndex, triggerIndex, index)
    shiftSelection('action', index)
  }

  // "Pick from map" (ConditionForm/ActionForm's map-pin button) — switches to
  // Map Grid, then writes the clicked object's SID back into this exact
  // param once resolved. Reads the trigger fresh at resolve time (via
  // getState()) rather than trusting this closure's captured conditions/
  // actions, since the whole Scenario Editor unmounts for the round trip.
  const handlePickFromMap = (paramIndex: number, kind: 'mapEntity' | 'hero') => {
    if (!selected) return
    const resumeSelection = selected
    const def =
      resumeSelection.kind === 'condition'
        ? CONDITION_REGISTRY[conditions[resumeSelection.index]?.c]
        : ACTION_REGISTRY[actions[resumeSelection.index]?.a]
    const label = def?.params[paramIndex]?.label ?? 'value'

    requestPick({
      kind,
      label,
      resumeSelection,
      onResolve: (value) => {
        const liveTrigger =
          useScenarioStore.getState().scenario.quests[questIndex]?.subQuests[subQuestIndex]?.triggers[triggerIndex]
        if (!liveTrigger) return
        if (resumeSelection.kind === 'condition') {
          const current = liveTrigger.conditions[resumeSelection.index]
          if (!current) return
          const p = [...(current.p ?? [])]
          p[paramIndex] = value
          updateCondition(questIndex, subQuestIndex, triggerIndex, resumeSelection.index, { ...current, p })
        } else {
          const current = liveTrigger.actions[resumeSelection.index]
          if (!current) return
          const p = [...(current.p ?? [])]
          p[paramIndex] = value
          updateAction(questIndex, subQuestIndex, triggerIndex, resumeSelection.index, { ...current, p })
        }
      },
    })
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

      {activeSubjectSeed && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
            Creating a rule for <strong>{activeSubjectSeed.displayName || activeSubjectSeed.entitySid}</strong>
          </span>
          <Button variant="ghost" size="sm" className="h-6 shrink-0 text-xs" onClick={clearSubjectSeed}>
            Done
          </Button>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
          <p className="text-sm font-medium">This rule doesn't do anything yet.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <AddNodePopover kind="condition" onPick={handleAddCondition} subjectKey={activeSubjectSeed?.subjectKey}>
              <Button variant="outline" size="lg" className="gap-1.5 rounded-xl border-amber-300/70">
                <Plus className="h-4 w-4" />
                Add a condition <span className="text-muted-foreground">(the "when")</span>
              </Button>
            </AddNodePopover>
            <AddNodePopover kind="action" onPick={handleAddAction} subjectKey={activeSubjectSeed?.subjectKey}>
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

            <AddNodePopover kind="condition" onPick={handleAddCondition} subjectKey={activeSubjectSeed?.subjectKey}>
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

            <AddNodePopover kind="action" onPick={handleAddAction} subjectKey={activeSubjectSeed?.subjectKey}>
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
        onPickFromMap={handlePickFromMap}
      />
    </div>
  )
}
