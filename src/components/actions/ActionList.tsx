import type { Action } from '@/types/scenario'
import ActionForm from './ActionForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface Props {
  actions: Action[]
  onAdd: () => void
  onUpdate: (index: number, action: Action) => void
  onRemove: (index: number) => void
}

export default function ActionList({ actions, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="space-y-2">
      {actions.length === 0 && (
        <p className="text-xs text-muted-foreground">No actions defined.</p>
      )}
      {actions.map((action, i) => (
        <ActionForm
          key={i}
          action={action}
          onChange={(a) => onUpdate(i, a)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5 text-xs">
        <Plus className="h-3 w-3" />
        Add Action
      </Button>
    </div>
  )
}
