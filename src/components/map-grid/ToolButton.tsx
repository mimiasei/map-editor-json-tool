// ─── Map Grid — icon-only tool button with a styled tooltip ────────────────
// issue #203: the Paint toolbar grew to 13 tools and ran out of horizontal room, so idle tools show only their icon.
// The tool name appears as a tooltip above the icon on hover; the native `title` is kept as well (longer hover, full
// description). Only used for a tool's IDLE state — the "Drawing…"/"Stop (Esc)" active state has its own rendering.

import { forwardRef } from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> {
  icon: ReactNode
  label: string
  title: string
}

// forwardRef + prop spread: a Radix `<PopoverTrigger asChild>` hands its ref and handlers to this button; without
// them the popover has no anchor and never opens (the Zones tool).
const ToolButton = forwardRef<HTMLButtonElement, Props>(function ToolButton({ icon, label, title, ...rest }, ref) {
  return (
    <TooltipPrimitive.Root delayDuration={80}>
      <TooltipPrimitive.Trigger asChild>
        <button
          ref={ref}
          type="button"
          title={title}
          {...rest}
          className="flex items-center h-6 px-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
        >
          {icon}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          sideOffset={8}
          className="z-[100] rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-lg ring-1 ring-black/10 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-foreground" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
})

export default ToolButton
