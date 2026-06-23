import { isTauri } from '@/lib/native-fs'
import { SquareArrowOutUpRight } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Props {
  panelId: string
  onUndock: () => void
  /** Pass true while this panel is already open in a separate window. */
  disabled?: boolean
}

/**
 * A small icon button that opens a panel in a separate Tauri window.
 * Renders nothing in the browser build.
 * Visibility is controlled by the parent container via the `group` class:
 * the button is opacity-0 by default and opacity-100 on group-hover.
 */
export default function UndockButton({ panelId: _panelId, onUndock, disabled }: Props) {
  if (!isTauri()) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
          onClick={onUndock}
          disabled={disabled}
          aria-label="Pop out into separate window"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Pop out into separate window</TooltipContent>
    </Tooltip>
  )
}
