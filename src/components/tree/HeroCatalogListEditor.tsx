// ─── Generic "N catalog items, each with extra per-row fields" list editor ──
// issue #141: startSquad/startSquadAlt (unit + min/max), startSkills (skill +
// level), startMagics (spell + level + isLearned) are all the same shape —
// an EntityCombobox per row (already generic over creature/skill/spell, see
// src/components/common/EntityCombobox.tsx) plus 1-2 small extra fields and
// a remove button, capped at some max row count. One component parameterized
// over the row shape, rather than three near-identical editors.
//
// Add/remove scaffolding mirrors ConditionForm.tsx's free-param editor
// (src/components/conditions/ConditionForm.tsx) — same pattern, applied to
// richer row objects instead of plain strings.

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import EntityCombobox from '@/components/common/EntityCombobox'
import { Plus, Trash2 } from 'lucide-react'

interface HeroCatalogListEditorProps<T extends Record<string, unknown>> {
  category: 'creature' | 'skill' | 'spell'
  rows: T[]
  onChange: (rows: T[]) => void
  maxRows: number
  /** A fresh row to append — must have `refField` set to '' */
  emptyRow: T
  /** Which key on T holds the catalog entity id (e.g. 'sid' for squads/
   *  skills, 'sidConfig' for magics) — real hero JSON uses different key
   *  names for this across tables, so the editor stays generic instead of
   *  assuming one. */
  refField: keyof T & string
  /** Renders whatever extra inputs this row needs (min/max, level,
   *  isLearned, ...) — receives the row and an updater for a partial patch. */
  renderExtraFields: (row: T, index: number, update: (patch: Partial<T>) => void) => ReactNode
  addLabel?: string
}

export default function HeroCatalogListEditor<T extends Record<string, unknown>>({
  category,
  rows,
  onChange,
  maxRows,
  emptyRow,
  refField,
  renderExtraFields,
  addLabel = 'Add',
}: HeroCatalogListEditorProps<T>) {
  const addRow = () => {
    if (rows.length >= maxRows) return
    onChange([...rows, { ...emptyRow }])
  }
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const updateRow = (index: number, patch: Partial<T>) => {
    const next = rows.slice()
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <EntityCombobox
              category={category}
              value={String(row[refField] ?? '')}
              onChange={(v) => updateRow(index, { [refField]: v } as Partial<T>)}
            />
          </div>
          {renderExtraFields(row, index, (patch) => updateRow(index, patch))}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(index)}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={addRow}
        disabled={rows.length >= maxRows}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel} ({rows.length}/{maxRows})
      </Button>
    </div>
  )
}
