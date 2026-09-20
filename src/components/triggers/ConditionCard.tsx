import type { Condition } from '@/types/scenario'
import { CONDITION_REGISTRY } from '@/schema/conditions'
import { getConditionCategory, formatConditionSentence, isConditionConfigured } from '@/lib/trigger-visual'
import { Pencil, Trash2, AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  condition: Condition
  onEdit: () => void
  onRemove: () => void
}

export default function ConditionCard({ condition, onEdit, onRemove }: Props) {
  const def = CONDITION_REGISTRY[condition.c]
  const category = condition.c ? getConditionCategory(condition.c) : undefined
  const Icon = category?.icon ?? HelpCircle
  const configured = isConditionConfigured(condition)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit()
        }
      }}
      className={cn(
        'group relative flex min-w-[180px] cursor-pointer items-start gap-2.5 rounded-2xl border-l-4 px-4 py-3 pr-9 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        configured
          ? 'border border-amber-100 border-l-amber-400 bg-card dark:border-amber-900/40'
          : 'border border-dashed border-amber-300/70 border-l-amber-300 bg-amber-50/50 dark:bg-amber-950/10',
      )}
    >
      {configured ? (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      )}
      <div className="min-w-0">
        <p className={cn('text-sm leading-snug', !configured && 'italic text-muted-foreground')}>
          {configured ? formatConditionSentence(condition) : 'Needs setup — click to configure'}
        </p>
        {configured && def && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{def.label}</p>
        )}
      </div>
      <div className="absolute right-1.5 top-1.5 flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
