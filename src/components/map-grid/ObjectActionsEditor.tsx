// ─── Map Grid — "Actions Before / After" editor for one object or zone ───────
// What runs when a hero interacts with an object, or steps onto a trigger zone (see the official guide's
// "Interaction triggers" and "Trigger zones" sections). The edits are kept as a draft and written to the map
// with one Apply, since every write is a full-document undo step and typing would otherwise write per keystroke.

import { useMemo, useState } from 'react'
import type { ObjectActions } from '@/types/map-context'
import { ACTION_REGISTRY } from '@/schema/actions'
import { HIDDEN_ACTION_TYPES, formatActionSentence, isActionConfigured } from '@/lib/trigger-visual'
import { cleanAction } from '@/lib/scenario-clean'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import ActionForm from '@/components/actions/ActionForm'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus } from 'lucide-react'

/** Actions that only exist in the quest file (guide, "Restrictions in usage"): they do nothing on an object or zone. */
const QUEST_FILE_ONLY = new Set([
  'NextQuest', 'EndQuest', 'NextSubQuest', 'SubQuestActivate', 'SubQuestDeactivate', 'CurrentSubQuestDone',
  'SubQuestDone', 'NextQuestAfterGroup', 'NextAfterGroup', 'NextSubGroupAfterGroup', 'TriggerClear', 'TriggerClearCustom',
])
const allowedType = (type: string) => !QUEST_FILE_ONLY.has(type) && !HIDDEN_ACTION_TYPES.has(type)

interface Props {
  title: string
  hint: string
  value: ObjectActions | undefined
  /** The map's player slot count, for the player dropdown. */
  playersCount: number
  /** Omitted when the column is a read-only mirror. */
  onApply?: (value: ObjectActions | null) => void
}

const EMPTY: ObjectActions = { repeat: false, sides: '', actions: [] }

export default function ObjectActionsEditor({ title, hint, value, playersCount, onApply }: Props) {
  const counters = useScenarioStore((s) => s.scenario.counters)
  const requestPick = useViewBridgeStore((s) => s.requestPick)
  const saved = value ?? EMPTY
  const [draft, setDraft] = useState<ObjectActions>(saved)
  const [seen, setSeen] = useState(saved)
  // The selection or the map changed underneath the draft: start over from what the map now has.
  if (seen !== saved) {
    setSeen(saved)
    setDraft(saved)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const incomplete = draft.actions.some((a) => !isActionConfigured(a))
  const counterIds = useMemo(() => new Set(counters.map((c) => c.sid)), [counters])
  const unknownCounter = draft.actions.find((a) => {
    const def = ACTION_REGISTRY[a.a]
    return def?.params.some((p, i) => p.ref === 'counter' && a.p?.[i] && !counterIds.has(a.p?.[i] ?? ''))
  })

  // Tile/object/hero params are picked on the grid this column belongs to; the draft stays as it is meanwhile.
  const pickFromMap = (actionIndex: number) => (paramIndex: number, kind: 'mapEntity' | 'hero' | 'node') =>
    requestPick({
      kind,
      label: ACTION_REGISTRY[draft.actions[actionIndex]?.a]?.params[paramIndex]?.label ?? 'value',
      keepMapGridOpen: true,
      onResolve: (value) =>
        setDraft((d) => ({
          ...d,
          actions: d.actions.map((a, j) => {
            if (j !== actionIndex) return a
            const p = [...(a.p ?? [])]
            p[paramIndex] = value
            return { ...a, p }
          }),
        })),
    })

  if (!onApply) {
    if (!value) return null
    return (
      <div className="space-y-1 pt-2 mt-1 border-t border-border/50">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <ul className="list-disc pl-4 text-xs space-y-0.5">
          {value.actions.map((a, i) => (
            <li key={i}>{formatActionSentence(a)}</li>
          ))}
        </ul>
      </div>
    )
  }

  const sidesOptions = Array.from({ length: Math.max(playersCount, 1) }, (_, i) => String(i))
  if (draft.sides !== '' && !sidesOptions.includes(draft.sides)) sidesOptions.push(draft.sides)

  return (
    <div className="space-y-2 pt-2 mt-1 border-t border-border/50">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {draft.actions.map((action, i) => (
        <ActionForm
          key={i}
          action={action}
          typeFilter={allowedType}
          onPickFromMap={pickFromMap(i)}
          siblingActions={draft.actions}
          onDuplicate={(copy) => setDraft({ ...draft, actions: [...draft.actions.slice(0, i + 1), { a: copy.a, p: copy.p ?? [] }, ...draft.actions.slice(i + 1)] })}
          onChange={(next) => setDraft({ ...draft, actions: draft.actions.map((a, j) => (j === i ? { a: next.a, p: next.p ?? [] } : a)) })}
          onRemove={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setDraft({ ...draft, actions: [...draft.actions, { a: 'CounterSet', p: ['', ''] }] })}
      >
        <Plus className="h-3 w-3" />
        Add action
      </Button>

      {draft.actions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch id={`oa-repeat-${title}`} checked={draft.repeat} onCheckedChange={(repeat) => setDraft({ ...draft, repeat })} />
            <Label htmlFor={`oa-repeat-${title}`} className="text-xs">Repeat</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Off: the actions run only the first time. On: every time a hero interacts (zones: every time one enters from outside).
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">For player</Label>
            <Select value={draft.sides === '' ? 'any' : draft.sides} onValueChange={(v) => setDraft({ ...draft, sides: v === 'any' ? '' : v })}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any player</SelectItem>
                {sidesOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    Player {Number(s) + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {incomplete && <p className="text-xs text-amber-600">Fill in every required field of every action before applying.</p>}
      {unknownCounter && (
        <p className="text-xs text-amber-600">A counter used here is not in the quest file's counters; the game cannot use an unknown counter.</p>
      )}

      {dirty && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={incomplete}
            onClick={() => onApply(draft.actions.length === 0 ? null : { ...draft, actions: draft.actions.map((a) => ({ a: a.a, p: (cleanAction(a).p ?? []).map(String) })) })}
          >
            Apply
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDraft(saved)}>
            Revert
          </Button>
        </div>
      )}
    </div>
  )
}
