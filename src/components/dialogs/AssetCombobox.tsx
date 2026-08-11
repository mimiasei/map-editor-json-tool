// ─── Free-text combobox over a list of known dialog asset paths / SIDs ────────
// Mirrors EntityCombobox's behaviour (type-to-filter, free text always accepted)
// but takes its suggestions as a plain array, because dialog assets come from the
// catalog as string lists rather than entity registries. With no suggestions the
// control degrades to a plain input — which is what happens when Core.zip is not
// loaded.

import { useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown } from 'lucide-react'

export interface AssetSuggestion {
  /** Value written to the JSON. */
  value: string
  /** Human-readable label. Falls back to the value when omitted. */
  label?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  suggestions: AssetSuggestion[]
  placeholder?: string
  /** Shown when the suggestion list is empty. */
  emptyHint?: string
  className?: string
  /** Resolve a preview image for a suggestion — lets avatar rows show the portrait. */
  thumbnailFor?: (value: string) => string | null
}

/** Show the tail of a long asset path — the leading directories are noise. */
function shortenPath(path: string): string {
  const parts = path.split('/')
  return parts.length > 2 ? `…/${parts.slice(-1)[0]}` : path
}

export default function AssetCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  emptyHint = 'No suggestions — load Core.zip via Game Data',
  className = '',
  thumbnailFor,
}: Props) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!value) return suggestions.slice(0, 200)
    const q = value.toLowerCase()
    return suggestions
      .filter((s) => s.value.toLowerCase().includes(q) || (s.label ?? '').toLowerCase().includes(q))
      .slice(0, 200)
  }, [suggestions, value])

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`h-7 text-xs font-mono pr-7 ${className}`}
          />
        </PopoverAnchor>
        {suggestions.length > 0 && (
          <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none opacity-60" />
        )}
      </div>

      <PopoverContent
        className="p-0"
        style={{ width: 'var(--radix-popover-anchor-width)' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // See EntityCombobox.tsx's identical handler for the full reasoning
        // — only the anchor input itself needs excluding from Radix's own
        // outside-interaction dismissal; scrolling this list (scrollbar or
        // wheel) never reaches this handler at all, so it can't close the
        // popover either way, unlike the onBlur-timeout approach this
        // replaced.
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault()
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              {suggestions.length === 0 ? emptyHint : 'No match — free text is accepted'}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((s) => (
                <CommandItem
                  key={s.value}
                  value={s.value}
                  onSelect={() => {
                    onChange(s.value)
                    setOpen(false)
                  }}
                  className="flex justify-between gap-2 text-xs py-1"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {thumbnailFor?.(s.value) && (
                      <img
                        src={thumbnailFor(s.value)!}
                        alt=""
                        width={22}
                        height={22}
                        style={{ objectFit: 'contain', flexShrink: 0 }}
                      />
                    )}
                    <span className="truncate">{s.label ?? shortenPath(s.value)}</span>
                  </span>
                  {s.label && (
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[55%]">
                      {s.value}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
