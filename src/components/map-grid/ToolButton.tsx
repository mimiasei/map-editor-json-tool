// ─── Map Grid — icon-only tool button with a styled tooltip ────────────────
// issue #203: the Paint toolbar grew to 13 tools and ran out of horizontal room, so idle tools show only their icon.
// The tool name appears as a tooltip above the icon on hover; the native `title` is kept as well (longer hover, full
// description). Only used for a tool's IDLE state — the "Drawing…"/"Stop (Esc)" active state has its own rendering.

import { forwardRef } from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

// Tweak the whole toolbar here. Full class names, so Tailwind can see them. The svg rule beats the per-icon h-3.5 w-3.5
// set at each call site.
const ICON_SIZE = '[&_svg]:h-[15px] [&_svg]:w-[15px]'
const BUTTON_PADDING_X = 'px-2.5'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> {
  icon: ReactNode
  label: string
  /** Longer description as the native hover title; omit when the label says it all. */
  title?: string
  /** Pressed look for toggles (the toolbar's panel toggles). */
  active?: boolean
}

// forwardRef + prop spread: a Radix `<PopoverTrigger asChild>` hands its ref and handlers to this button; without
// them the popover has no anchor and never opens (the Zones tool).
const ToolButton = forwardRef<HTMLButtonElement, Props>(function ToolButton({ icon, label, title, active, ...rest }, ref) {
  return (
    <TooltipPrimitive.Root delayDuration={80}>
      <TooltipPrimitive.Trigger asChild>
        <button
          ref={ref}
          type="button"
          title={title}
          {...rest}
          className={`flex items-center h-9 ${BUTTON_PADDING_X} ${ICON_SIZE} rounded-xl px-1.0 py-2.0 hover:bg-secondary [&:hover_svg_*]:[stroke-width:1.5] [&_svg_*]:transition-[stroke-width] [&_svg_*]:duration-125 [&:hover_svg]:scale-[1.75] [&_svg]:transition-transform [&_svg]:duration-125 text-xs font-medium text-muted-foreground transition-colors duration-125 hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 ${active ? 'bg-secondary text-foreground' : ''}`}
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
