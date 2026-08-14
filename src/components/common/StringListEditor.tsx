import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'

// ─── StringListEditor ───────────────────────────────────────────────────────────
// Unbounded add/remove list of plain text values — the string-value sibling of
// EntityPickerList (which is specifically for mapEntity/object SIDs). For script
// template slots needing free-form text (e.g. a riddle's list of wrong answers),
// not a reference to any existing catalog/placed entity.

interface Props {
  values: string[]
  onChange: (values: string[]) => void
  addLabel?: string
  placeholder?: string
}

export default function StringListEditor({ values, onChange, addLabel = '+ Add', placeholder }: Props) {
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
          <Input
            className="flex-1"
            value={value}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder={placeholder}
          />
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
