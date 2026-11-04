// ─── Map Grid — icon button of the Browse/Paint switch ─────────────────────
// Same black tooltip as ToolButton (bg-foreground / text-background); no hover zoom, since the pair sits in a small segmented control.

import type { ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

interface Props {
  icon: ReactNode
  label: string
  /** Selected look; the caller picks the colour so Browse and Paint can differ. */
  activeClass: string
  active: boolean
  onClick: () => void
}

export default function ModeToggleButton({ icon, label, activeClass, active, onClick }: Props) {
  return (
    <TooltipPrimitive.Root delayDuration={80}>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          className={`flex h-7 w-9 items-center justify-center rounded-sm transition-colors [&_svg]:h-5 [&_svg]:w-5 ${active ? activeClass : 'text-muted-foreground hover:text-foreground'}`}
          onClick={onClick}
        >
          {icon}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          sideOffset={8}
          className="z-[100] rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-lg ring-1 ring-black/10 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-foreground" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
