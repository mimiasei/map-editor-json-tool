// ─── Map Grid — icon-only tool button with hover-reveal label ──────────────
// issue #203: the Paint toolbar grew to 13 tools and ran out of horizontal
// room once every idle tool button showed both an icon and a text label.
// Icon-only by default; hovering expands the label immediately (pure CSS,
// no JS state), pushing whatever follows it in the row to the right — the
// existing `title` attribute still surfaces the browser's native tooltip on
// a longer hover, same as before. Only used for a tool's IDLE state — the
// "Drawing…"/"Stop (Esc)" active state (only one tool at a time) keeps its
// own separate rendering, unaffected by this.

import type { ReactNode, MouseEventHandler } from 'react'

interface Props {
  icon: ReactNode
  label: string
  title: string
  onClick: MouseEventHandler<HTMLButtonElement>
}

export default function ToolButton({ icon, label, title, onClick }: Props) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="group flex items-center h-6 px-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      <span className="max-w-0 group-hover:max-w-[7rem] group-hover:ml-1.5 overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-150 ease-out">
        {label}
      </span>
    </button>
  )
}
