import type { Condition } from '@/types/scenario'
import ConditionForm from './ConditionForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface Props {
  conditions: Condition[]
  onAdd: () => void
  onUpdate: (index: number, condition: Condition) => void
  onRemove: (index: number) => void
}

export default function ConditionList({ conditions, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="space-y-2">
      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground">No conditions — trigger fires every tick.</p>
      )}
      {conditions.map((condition, i) => (
        <ConditionForm
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
