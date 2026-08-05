import type { DialogCondition } from '@/types/dialog'
import DialogConditionForm from './DialogConditionForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface Props {
  conditions: DialogCondition[]
  onAdd: () => void
  onUpdate: (index: number, condition: DialogCondition) => void
  onRemove: (index: number) => void
}

export default function DialogConditionList({ conditions, onAdd, onUpdate, onRemove }: Props) {
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
      <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5 text-xs">
        <Plus className="h-3 w-3" />
        Add Condition
      </Button>
    </div>
  )
}
