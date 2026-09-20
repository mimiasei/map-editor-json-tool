import type { Trigger, Condition, Action } from '@/types/scenario'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import ConditionForm from '@/components/conditions/ConditionForm'
import ActionForm from '@/components/actions/ActionForm'
import { formatConditionSentence, formatActionSentence } from '@/lib/trigger-visual'

export type SelectedNode = { kind: 'condition'; index: number } | { kind: 'action'; index: number }

interface Props {
  trigger: Trigger
  selected: SelectedNode | null
  onClose: () => void
  onUpdateCondition: (index: number, condition: Condition) => void
  onRemoveCondition: (index: number) => void
  onUpdateAction: (index: number, action: Action) => void
  onRemoveAction: (index: number) => void
}

export default function TriggerInspectorPanel({
  trigger,
  selected,
  onClose,
  onUpdateCondition,
  onRemoveCondition,
  onUpdateAction,
  onRemoveAction,
}: Props) {
  return (
    <Sheet
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="overflow-y-auto">
        {selected && selected.kind === 'condition' && (
          <>
            <SheetHeader>
              <SheetTitle>Edit condition</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {formatConditionSentence(trigger.conditions[selected.index])}
              </p>
            </SheetHeader>
            <ConditionForm
              condition={trigger.conditions[selected.index]}
              onChange={(c) => onUpdateCondition(selected.index, c)}
              onRemove={() => {
                onRemoveCondition(selected.index)
                onClose()
              }}
            />
          </>
        )}
        {selected && selected.kind === 'action' && (
          <>
            <SheetHeader>
              <SheetTitle>Edit action</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {formatActionSentence(trigger.actions[selected.index])}
              </p>
            </SheetHeader>
            <ActionForm
              action={trigger.actions[selected.index]}
              onChange={(a) => onUpdateAction(selected.index, a)}
              onRemove={() => {
                onRemoveAction(selected.index)
                onClose()
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
