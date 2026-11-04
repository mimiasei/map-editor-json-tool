// ─── Collapsible checkbox group with All / None ──────────────────────────────
// A header row (click anywhere on it to fold the list) with the selected count and All / None buttons, then the checkboxes.
// The count stays visible when the list is folded, so a hidden selection is never a surprise.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown, ChevronRight } from '@/components/ui/icons'

interface Props<T extends string | number> {
  options: readonly { id: T; label: string }[]
  selected: ReadonlySet<T>
  onChange: (next: Set<T>) => void
  defaultOpen?: boolean
}

export default function CheckGroup<T extends string | number>({ options, selected, onChange, defaultOpen = true }: Props<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const count = options.filter((o) => selected.has(o.id)).length
  const toggle = (id: T, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onChange(next)
  }
  const pill = 'h-5 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

  return (
    <div>
      <div className="flex items-center gap-1 py-0.5">
        <button
          type="button"
          aria-expanded={open}
          className="flex flex-1 items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-secondary-foreground">{t('mapGrid.generateOnMap.selectedCount', { selected: count, total: options.length })}</span>
        </button>
        <button type="button" className={pill} disabled={count === options.length} onClick={() => onChange(new Set(options.map((o) => o.id)))}>
          {t('mapGrid.generateOnMap.selectAll')}
        </button>
        <button type="button" className={pill} disabled={count === 0} onClick={() => onChange(new Set())}>
          {t('mapGrid.generateOnMap.selectNone')}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 py-1.5 pl-5">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox checked={selected.has(o.id)} onCheckedChange={(v) => toggle(o.id, v === true)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
