import { isTauri } from '@/lib/native-fs'
import { SquareArrowOutUpRight } from '@/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  if (!isTauri()) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus:opacity-100 focus:pointer-events-auto transition-opacity h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
          onClick={onUndock}
          disabled={disabled}
          aria-label={t('panels.undockButton.popOutIntoSeparateWindow')}
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('panels.undockButton.popOutIntoSeparateWindow')}</TooltipContent>
    </Tooltip>
  )
}
