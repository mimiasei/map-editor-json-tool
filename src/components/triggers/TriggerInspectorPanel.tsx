import type { Trigger, Condition, Action } from '@/types/scenario'
import { useEffect, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import ConditionForm from '@/components/conditions/ConditionForm'
import ActionForm from '@/components/actions/ActionForm'
import { formatConditionSentence, formatActionSentence } from '@/lib/trigger-visual'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'

export type SelectedNode = { kind: 'condition'; index: number } | { kind: 'action'; index: number }

interface Props {
  trigger: Trigger
  selected: SelectedNode | null
  onClose: () => void
  onUpdateCondition: (index: number, condition: Condition) => void
  onRemoveCondition: (index: number) => void
  onUpdateAction: (index: number, action: Action) => void
  onRemoveAction: (index: number) => void
  /** "Pick from map" for a mapEntity/hero field on whichever row is open —
   *  see ConditionForm/ActionForm's identical prop. */
  onPickFromMap?: (paramIndex: number, kind: 'mapEntity' | 'hero' | 'node') => void
}

export default function TriggerInspectorPanel({
  trigger,
  selected,
  onClose,
  onUpdateCondition,
  onRemoveCondition,
  onUpdateAction,
  onRemoveAction,
  onPickFromMap,
}: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const placedObjects = useMapContextStore((s) => s.context?.placedObjects)

  /** Snapshot of the row being edited, taken the moment it opens — lets
   *  Cancel revert whatever was typed during this editing session, since
   *  ConditionForm/ActionForm apply every change live (no draft buffer of
   *  their own). Re-taken only when the open row itself changes, never on
   *  its own later edits. */
  const snapshotRef = useRef<Condition | Action | null>(null)
  useEffect(() => {
    if (!selected) {
      snapshotRef.current = null
      return
    }
    snapshotRef.current =
      selected.kind === 'condition' ? trigger.conditions[selected.index] : trigger.actions[selected.index]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.kind, selected?.index])

  const handleCancel = () => {
    if (selected && snapshotRef.current) {
      if (selected.kind === 'condition') onUpdateCondition(selected.index, snapshotRef.current as Condition)
      else onUpdateAction(selected.index, snapshotRef.current as Action)
    }
    onClose()
  }

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
                {formatConditionSentence(trigger.conditions[selected.index], { catalog, placedObjects })}
              </p>
            </SheetHeader>
            <ConditionForm
              condition={trigger.conditions[selected.index]}
              onChange={(c) => onUpdateCondition(selected.index, c)}
              onRemove={() => {
                onRemoveCondition(selected.index)
                onClose()
              }}
              onPickFromMap={onPickFromMap}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={onClose}>Confirm</Button>
            </div>
          </>
        )}
        {selected && selected.kind === 'action' && (
          <>
            <SheetHeader>
              <SheetTitle>Edit action</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {formatActionSentence(trigger.actions[selected.index], { catalog, placedObjects })}
              </p>
            </SheetHeader>
            <ActionForm
              action={trigger.actions[selected.index]}
              onChange={(a) => onUpdateAction(selected.index, a)}
              onRemove={() => {
                onRemoveAction(selected.index)
                onClose()
              }}
              onPickFromMap={onPickFromMap}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={onClose}>Confirm</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
