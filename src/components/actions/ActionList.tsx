import type { Action } from '@/types/scenario'
import ActionForm from './ActionForm'
import { Button } from '@/components/ui/button'
import { Plus } from '@/components/ui/icons'

interface Props {
  actions: Action[]
  /** Appends a new action. Pass a specific action (e.g. a duplicate) to insert
   *  that instead of the caller's usual blank default. */
  onAdd: (action?: Action) => void
  onUpdate: (index: number, action: Action) => void
  onRemove: (index: number) => void
  /** Passed through to each ActionForm's type dropdown — see its own doc comment. */
  typeFilter?: (type: string) => boolean
}

export default function ActionList({ actions, onAdd, onUpdate, onRemove, typeFilter }: Props) {
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
          typeFilter={typeFilter}
          siblingActions={actions}
          onDuplicate={(copy) => onAdd(copy)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onAdd()} className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Add Action
        </Button>
      </div>
    </div>
  )
}
