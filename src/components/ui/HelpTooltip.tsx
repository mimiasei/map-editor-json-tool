import { useTooltips } from '@/hooks/useGuideData'
import type { TooltipEntry } from '@/hooks/useGuideData'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Info, AlertTriangle } from 'lucide-react'

interface HelpTooltipProps {
  /** Which namespace to look up: actions, conditions, or fields */
  category: 'actions' | 'conditions' | 'fields'
  /** The type key, e.g. 'AddItemHero', 'Counter', 'quest.name' */
  id: string
  /** If provided, renders only the hint for a single parameter (used inline on param labels) */
  paramIndex?: number
  /** Additional class names on the icon button */
  className?: string
}

/**
 * Renders a small ⓘ icon that shows a help popover on click.
 * Renders nothing if no tooltip entry exists for the given id (graceful degradation).
 */
export default function HelpTooltip({ category, id, paramIndex, className }: HelpTooltipProps) {
  const tooltips = useTooltips()

  let entry: TooltipEntry | string | undefined

  if (category === 'fields') {
    entry = tooltips.fields[id]
  } else {
    entry = tooltips[category][id]
  }

  // No entry — render nothing (new actions without tooltips don't break the UI)
  if (!entry) return null

  // Field tooltip: just a string
  if (typeof entry === 'string') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
            aria-label="Help"
          >
            <Info className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 text-xs p-3 space-y-1" side="top">
          <p>{entry}</p>
        </PopoverContent>
      </Popover>
    )
  }

  // Param-only mode: just show the param hint inline (no popover needed)
  if (paramIndex !== undefined) {
    const hint = entry.params?.[String(paramIndex)]
    if (!hint) return null
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
            aria-label="Parameter help"
          >
            <Info className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-xs p-3" side="top">
          <p>{hint}</p>
        </PopoverContent>
      </Popover>
    )
  }

  // Full tooltip with summary, optional params list, optional tip
  const hasParams = entry.params && Object.keys(entry.params).length > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ${className ?? ''}`}
          aria-label="Help"
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs p-3 space-y-2" side="top" align="start">
        {/* Summary */}
        <p className="text-foreground">{entry.summary}</p>

        {/* Parameter hints */}
        {hasParams && (
          <div className="space-y-1">
            <p className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">Parameters</p>
            {Object.entries(entry.params!).map(([idx, hint]) => (
              <div key={idx} className="flex gap-1.5">
                <span className="text-muted-foreground shrink-0">p[{idx}]</span>
                <span className="text-foreground">{hint}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tip callout */}
        {entry.tip && (
          <div className="flex gap-1.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/30 p-2">
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <span className="text-amber-800 dark:text-amber-200">{entry.tip}</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
