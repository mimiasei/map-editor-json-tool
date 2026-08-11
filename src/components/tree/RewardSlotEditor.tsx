// ─── Reward-slot editor (objectsProperties.propRewardParams.parameters) ────
// Issue #143: turns the read-only Rewards list (issue #138) into an editor.
// Slot COUNT is fixed by the object itself (e.g. custom_windmill always has
// exactly 1, custom_prismatic_lair always exactly 3 — confirmed across every
// real example in plans/testItems-props-reference.md) — there's no evidence
// slots are meant to be added/removed, only filled in, so this edits the
// array in place rather than offering add/remove like HeroCatalogListEditor.
// Each slot is one of 4 kinds (Empty/Resource/Artifact/Skill), decoded via
// classifyRewardParam and re-encoded via encodeRewardParam — the same
// shared helpers formatRewardParam's read-only display uses, so both agree
// on what a given raw string means.

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import EntityCombobox from '@/components/common/EntityCombobox'
import { classifyRewardParam, encodeRewardParam, type RewardParamClass } from '@/lib/map-grid/reward-params'
import { BASIC_RESOURCE_IDS } from '@/lib/resources'
import type { GameCatalog } from '@/lib/catalog/types'

type SlotKind = RewardParamClass['kind']

const KIND_LABELS: Record<SlotKind, string> = {
  empty: 'Empty',
  resource: 'Resource',
  artifact: 'Artifact',
  skill: 'Skill',
}

const SLOT_KINDS: SlotKind[] = ['empty', 'resource', 'artifact', 'skill']

interface RewardSlotEditorProps {
  parameters: string[]
  onChange: (parameters: string[]) => void
  catalog: GameCatalog | null
}

export default function RewardSlotEditor({ parameters, onChange, catalog }: RewardSlotEditorProps) {
  const updateSlot = (index: number, next: RewardParamClass) => {
    const nextParams = parameters.slice()
    nextParams[index] = encodeRewardParam(next)
    onChange(nextParams)
  }

  const handleKindChange = (index: number, kind: SlotKind) => {
    if (kind === 'empty') updateSlot(index, { kind: 'empty' })
    else if (kind === 'resource') updateSlot(index, { kind: 'resource', resource: BASIC_RESOURCE_IDS[0], amount: 1 })
    else if (kind === 'artifact') updateSlot(index, { kind: 'artifact', sid: '' })
    else updateSlot(index, { kind: 'skill', sid: '' })
  }

  return (
    <div className="space-y-2">
      {parameters.map((param, index) => {
        const c = classifyRewardParam(param, catalog)
        return (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{index + 1}.</span>
            <Select value={c.kind} onValueChange={(v) => handleKindChange(index, v as SlotKind)}>
              <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLOT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {c.kind === 'resource' && (
              <>
                <Select
                  value={c.resource}
                  onValueChange={(v) => updateSlot(index, { kind: 'resource', resource: v, amount: c.amount })}
                >
                  <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASIC_RESOURCE_IDS.map((r) => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={c.amount}
                  onChange={(e) => updateSlot(index, { kind: 'resource', resource: c.resource, amount: Number(e.target.value) || 0 })}
                  className="h-7 w-20 text-xs"
                />
              </>
            )}

            {(c.kind === 'artifact' || c.kind === 'skill') && (
              <div className="flex-1 min-w-0">
                <EntityCombobox
                  category={c.kind}
                  value={c.sid}
                  onChange={(v) => updateSlot(index, { kind: c.kind, sid: v })}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
