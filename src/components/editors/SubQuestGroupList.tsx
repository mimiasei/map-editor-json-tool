// ─── Subquest groups ──────────────────────────────────────────────────────────
// Gates a subquest (or another group) on several subquests finishing together, via
// NextAfterGroup / NextQuestAfterGroup / NextSubGroupAfterGroup. Previously only usable by
// SID convention — the group SID was just a free-text action parameter with nothing
// backing it, so there was no way to see or edit which subquests actually belonged to it.

import type { SubQuest, SubQuestGroup } from '@/types/scenario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  subQuests: SubQuest[]
  groups: SubQuestGroup[]
  onChange: (groups: SubQuestGroup[]) => void
}

function nextGroupSid(existing: SubQuestGroup[]): string {
  const taken = new Set(existing.map((g) => g.sid))
  let n = existing.length + 1
  while (taken.has(`group_${n}`)) n++
  return `group_${n}`
}

export default function SubQuestGroupList({ subQuests, groups, onChange }: Props) {
  const addGroup = () => onChange([...groups, { sid: nextGroupSid(groups), subQuests: [] }])

  const updateGroup = (i: number, patch: Partial<SubQuestGroup>) => {
    const next = [...groups]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  const removeGroup = (i: number) => onChange(groups.filter((_, j) => j !== i))

  const toggleMember = (i: number, sid: string) => {
    const group = groups[i]
    const isMember = group.subQuests.includes(sid)
    updateGroup(i, {
      subQuests: isMember
        ? group.subQuests.filter((s) => s !== sid)
        : [...group.subQuests, sid],
    })
  }

  return (
    <div className="space-y-2">
      {groups.length === 0 && (
        <p className="text-xs text-muted-foreground">No subquest groups.</p>
      )}

      {groups.map((group, i) => (
        <div key={i} className="space-y-1.5 rounded border border-border p-2">
          <div className="flex items-center gap-2">
            <Input
              value={group.sid}
              onChange={(e) => updateGroup(i, { sid: e.target.value })}
              placeholder="e.g. legendary_gear_group"
              className="h-7 text-xs"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => removeGroup(i)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {subQuests.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              Add subquests to this quest first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {subQuests.map((sq) => (
                <label
                  key={sq.sid}
                  className="flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={group.subQuests.includes(sq.sid)}
                    onCheckedChange={() => toggleMember(i, sq.sid)}
                  />
                  <span className="truncate">{sq.sid}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addGroup} className="gap-1.5 text-xs">
        <Plus className="h-3 w-3" />
        Add Subquest Group
      </Button>
    </div>
  )
}
