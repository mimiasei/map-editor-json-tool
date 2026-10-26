import { Plus, Trash2 } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import MapEntityPickField from '@/components/common/MapEntityPickField'
import type { StorySlotDef } from '@/types/story'

interface Props {
  slot: StorySlotDef
  values: string[]
  onChange: (values: string[]) => void
  requestMapPick?: (label: string, onPicked: (sid: string) => void) => void
}

const KIND_HINT: Record<StorySlotDef['entityKind'], string> = {
  town: 'a town',
  object: 'a named object',
  squad: 'a named army',
}

/** One story slot: a single map entity, or a growing list of them. */
export default function SlotPicker({ slot, values, onChange, requestMapPick }: Props) {
  const rows = values.length > 0 ? values : ['']
  const setAt = (i: number, v: string) => onChange(rows.map((r, idx) => (idx === i ? v : r)))

  return (
    <div className="space-y-1.5">
      <Label>{slot.label}</Label>
      <p className="text-xs text-muted-foreground">
        Pick {slot.cardinality === 'one' ? KIND_HINT[slot.entityKind] : `at least ${slot.min}, each ${KIND_HINT[slot.entityKind]}`}{' '}
        from the map. Suggestions are filled in for you.
      </p>
      {rows.map((value, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0">
            <MapEntityPickField
              value={value}
              onChange={(v) => setAt(i, v)}
              placeholder="Search placed objects…"
              label={slot.label}
              requestMapPick={requestMapPick}
            />
          </div>
          {slot.cardinality === 'many' && rows.length > slot.min && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {slot.cardinality === 'many' && (
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-primary" onClick={() => onChange([...rows, ''])}>
          <Plus className="h-3.5 w-3.5" /> Add another
        </Button>
      )}
    </div>
  )
}
