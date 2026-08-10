import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Info } from 'lucide-react'

interface FieldInfoProps {
  /** The explanation text shown in the popover. */
  text: string
  className?: string
}

/**
 * A small ⓘ icon that shows a plain-text help popover on click — visually
 * identical to HelpTooltip, but takes its text directly rather than looking
 * it up via useTooltips()'s actions/conditions/fields guide-content system
 * (the wrong data source for static field docs like the hero editor's,
 * issue #141). Use HelpTooltip for scripting fields, this for everything else.
 */
export default function FieldInfo({ text, className }: FieldInfoProps) {
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
        <p>{text}</p>
      </PopoverContent>
    </Popover>
  )
}
