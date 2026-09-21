import type { Action } from '@/types/scenario'
import { ACTION_REGISTRY } from '@/schema/actions'
import { getActionCategoryIcon, getActionSentenceSegments, isActionConfigured } from '@/lib/trigger-visual'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { Trash2, AlertTriangle, HelpCircle, OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SentenceView from './SentenceView'
import { cn } from '@/lib/utils'

interface Props {
  action: Action
  index: number
  dimmed?: boolean
  onEdit: () => void
  onRemove: () => void
  /** Clicking a node number in the sentence — see SentenceView's onNodeClick. */
  onPickNode?: (paramIndex: number, node: number) => void
}

export default function ActionCard({ action, index, dimmed, onEdit, onRemove, onPickNode }: Props) {
  const def = ACTION_REGISTRY[action.a]
  const Icon = def ? getActionCategoryIcon(def.category) : HelpCircle
  const configured = isActionConfigured(action)
  const breaks = action.break === true
  const catalog = useCatalogStore((s) => s.catalog)
  const placedObjects = useMapContextStore((s) => s.context?.placedObjects)

  return (
    <div className={cn('flex items-stretch gap-2', dimmed && 'opacity-60')}>
      {/*<div className="flex w-5 shrink-0 items-start justify-center pt-3 text-xs font-semibold text-muted-foreground">*/}
      {/*  {index + 1}*/}
      {/*</div>*/}
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
          'group relative flex flex-1 cursor-pointer items-start gap-2.5 rounded-2xl border-l-4 px-4 py-3 pr-9 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          configured
            ? 'border border-teal-100 border-l-teal-400 bg-card dark:border-teal-900/40'
            : 'border border-dashed border-teal-300/70 border-l-teal-300 bg-teal-50/50 dark:bg-teal-950/10',
        )}
      >
        {configured ? (
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={cn('text-sm leading-snug', !configured && 'italic text-muted-foreground')}>
              {configured ? (
                <SentenceView
                  segments={getActionSentenceSegments(action, { catalog, placedObjects })}
                  onNodeClick={onPickNode}
                />
              ) : (
                'Needs setup — click to configure'
              )}
            </p>
            {breaks && (
              <span
                title="If this action runs, none of the actions listed after it will run."
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <OctagonX className="h-2.5 w-2.5" />
                Stops here
              </span>
            )}
          </div>
          {configured && def && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{def.label}</p>
          )}
        </div>
        <div className="absolute right-1.5 top-1.5 flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
    </div>
  )
}
