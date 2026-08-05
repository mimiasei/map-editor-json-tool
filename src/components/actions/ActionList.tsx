import type { Action } from '@/types/scenario'
import ActionForm from './ActionForm'
import { Button } from '@/components/ui/button'
import { Plus, ClipboardPaste } from 'lucide-react'
import { useClipboardHasPayload } from '@/lib/clipboard'

interface Props {
  actions: Action[]
  /** Appends a new action. Pass a specific action (e.g. from the clipboard) to insert
   *  that instead of the caller's usual blank default. */
  onAdd: (action?: Action) => void
  onUpdate: (index: number, action: Action) => void
  onRemove: (index: number) => void
}

export default function ActionList({ actions, onAdd, onUpdate, onRemove }: Props) {
  const pasteable = useClipboardHasPayload<Action>('action')

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
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onAdd()} className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Add Action
        </Button>
        {pasteable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAdd(pasteable)}
            className="gap-1.5 text-xs"
            title="Paste the copied action"
          >
            <ClipboardPaste className="h-3 w-3" />
            Paste Action
          </Button>
        )}
      </div>
    </div>
  )
}
