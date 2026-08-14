import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import MapEntityCombobox from '@/components/common/MapEntityCombobox'

// ─── EntityPickerList ───────────────────────────────────────────────────────────
// Unbounded add/remove list of MapEntityCombobox rows, for script-template slots
// with cardinality: 'many' (see src/types/script-template.ts). Unlike the fixed
// 2-3 slot inputs used elsewhere in the schema (e.g. EndQuest's "Quest SID 1/2/3"),
// there's no arity ceiling here — each pick becomes its own generated
// trigger/action, so the list grows as large as the map author needs.

interface Props {
  values: string[]
  onChange: (values: string[]) => void
  addLabel?: string
  placeholder?: string
}

export default function EntityPickerList({ values, onChange, addLabel = '+ Add', placeholder }: Props) {
  const updateAt = (i: number, value: string) => {
    const next = [...values]
    next[i] = value
    onChange(next)
  }

  const removeAt = (i: number) => onChange(values.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1">
            <MapEntityCombobox value={value} onChange={(v) => updateAt(i, v)} placeholder={placeholder} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeAt(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => onChange([...values, ''])}
      >
        {addLabel}
      </button>
    </div>
  )
}
