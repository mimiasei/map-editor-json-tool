import type { DialogCondition } from '@/types/dialog'
import DialogConditionForm from './DialogConditionForm'
import { Button } from '@/components/ui/button'
import { Plus, ClipboardPaste } from 'lucide-react'
import { useClipboardHasPayload } from '@/lib/clipboard'

interface Props {
  conditions: DialogCondition[]
  /** Appends a new condition. Pass a specific condition (e.g. from the clipboard) to
   *  insert that instead of the caller's usual blank default. */
  onAdd: (condition?: DialogCondition) => void
  onUpdate: (index: number, condition: DialogCondition) => void
  onRemove: (index: number) => void
}

export default function DialogConditionList({ conditions, onAdd, onUpdate, onRemove }: Props) {
  const pasteable = useClipboardHasPayload<DialogCondition>('condition')

  return (
    <div className="space-y-2">
      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">No conditions.</p>
      )}
      {conditions.map((condition, i) => (
        <DialogConditionForm
          key={i}
          condition={condition}
          onChange={(c) => onUpdate(i, c)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onAdd()} className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Add Condition
        </Button>
        {pasteable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdd(pasteable)}
            className="gap-1.5 text-xs"
            title="Paste the copied condition"
          >
            <ClipboardPaste className="h-3 w-3" />
            Paste Condition
          </Button>
        )}
      </div>
    </div>
  )
}
