// ─── Buff stats editor (issue #165) ─────────────────────────────────────────
// Editable list for a custom buff's `data.stats` object — unlike artifact
// bonuses (an ARRAY of {type, parameters}), a buff's stats are a plain
// dictionary (`{offence: 2, hp: 10, ...}`), confirmed against every real
// Core/DB/buffs/*.json entry. `outDmgMods`/`inDmgMods` are the one exception
// — each holds a nested `{list: [{t, v}]}` of damage-type/percent pairs, so
// they get their own repeatable-list sub-form instead of a single value.
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import {
  BUFF_STAT_ATTRIBUTES,
  COMMON_DAMAGE_TYPES,
  buffAttributeById,
  defaultValueForBuffAttr,
} from '@/lib/buff-catalog'
import { percentToDisplay, displayToPercent } from '@/lib/percent-utils'

const DAMAGE_LIST_KEYS = ['outDmgMods', 'inDmgMods'] as const
type DamageListKey = (typeof DAMAGE_LIST_KEYS)[number]

const DAMAGE_LIST_LABELS: Record<DamageListKey, string> = {
  outDmgMods: 'Outgoing Damage by Type (%)',
  inDmgMods: 'Incoming Damage by Type (%)',
}

interface DamageListItem {
  t?: string
  v?: number
}

function damageListItems(stats: Record<string, unknown>, key: DamageListKey): DamageListItem[] {
  const val = stats[key]
  const list = val && typeof val === 'object' ? (val as Record<string, unknown>).list : undefined
  return Array.isArray(list) ? (list as DamageListItem[]) : []
}

function groupAttributes() {
  const groups: [string, typeof BUFF_STAT_ATTRIBUTES][] = []
  for (const attr of BUFF_STAT_ATTRIBUTES) {
    const existing = groups.find(([g]) => g === attr.group)
    if (existing) existing[1].push(attr)
    else groups.push([attr.group, [attr]])
  }
  return groups
}

interface BuffStatsEditorProps {
  stats: Record<string, unknown>
  onChange: (stats: Record<string, unknown>) => void
}

export default function BuffStatsEditor({ stats, onChange }: BuffStatsEditorProps) {
  const groups = useMemo(groupAttributes, [])
  const keys = Object.keys(stats)

  const setKey = (oldKey: string | null, newKey: string, value: unknown) => {
    const next = { ...stats }
    if (oldKey && oldKey !== newKey) delete next[oldKey]
    next[newKey] = value
    onChange(next)
  }
  const removeKey = (key: string) => {
    const next = { ...stats }
    delete next[key]
    onChange(next)
  }
  const setValue = (key: string, value: unknown) => {
    onChange({ ...stats, [key]: value })
  }

  const addPlainStat = () => {
    const attr = BUFF_STAT_ATTRIBUTES.find((a) => !(a.id in stats)) ?? BUFF_STAT_ATTRIBUTES[0]
    setKey(null, attr.id, defaultValueForBuffAttr(attr))
  }
  const addDamageList = (key: DamageListKey) => {
    setKey(null, key, { list: [{ t: COMMON_DAMAGE_TYPES[0], v: 0.1 }] })
  }

  return (
    <div className="space-y-2">
      {keys.map((key) => {
        if (DAMAGE_LIST_KEYS.includes(key as DamageListKey)) {
          const dmgKey = key as DamageListKey
          const items = damageListItems(stats, dmgKey)
          const setItems = (next: DamageListItem[]) => setValue(dmgKey, { list: next })
          return (
            <div key={key} className="rounded border border-border p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{DAMAGE_LIST_LABELS[dmgKey]}</p>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeKey(key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-1.5">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      list="buff-damage-type-options"
                      className="h-7 flex-1 text-xs"
                      placeholder="Damage/attack type…"
                      value={item.t ?? ''}
                      onChange={(e) => setItems(items.map((it, idx) => (idx === i ? { ...it, t: e.target.value } : it)))}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        className="h-7 w-20 text-xs"
                        value={percentToDisplay(item.v !== undefined ? String(item.v) : '')}
                        onChange={(e) => setItems(items.map((it, idx) => (idx === i ? { ...it, v: Number(displayToPercent(e.target.value)) } : it)))}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setItems([...items, { t: COMMON_DAMAGE_TYPES[0], v: 0.1 }])}>
                  + Add damage type
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Negative reduces damage; positive increases it. Common types are suggested, but any real damage/attack-type id can be typed.
              </p>
            </div>
          )
        }

        const attr = buffAttributeById(key)
        const value = stats[key]
        return (
          <div key={key} className="rounded border border-border p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Select
                value={key}
                onValueChange={(id) => {
                  const a = buffAttributeById(id)
                  setKey(key, id, a ? defaultValueForBuffAttr(a) : 'true')
                }}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map(([group, attrs]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {attrs.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                  {!attr && <SelectItem value={key}>{key}</SelectItem>}
                </SelectContent>
              </Select>
              {attr?.valueKind === 'boolean' ? (
                <label className="flex items-center gap-1.5 text-xs shrink-0">
                  <Checkbox checked={value === true || value === 'true'} onCheckedChange={(c) => setValue(key, !!c)} />
                  On
                </label>
              ) : attr?.valueKind === 'percent' ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Input type="number" className="h-7 w-20 text-xs" value={percentToDisplay(value !== undefined ? String(value) : '')} onChange={(e) => setValue(key, Number(displayToPercent(e.target.value)))} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              ) : (
                <Input type="number" className="h-7 w-24 text-xs shrink-0" value={typeof value === 'number' ? value : Number(value) || 0} onChange={(e) => setValue(key, Number(e.target.value) || 0)} />
              )}
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeKey(key)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{attr?.description ?? 'Not a recognized stat key — kept as-is.'}</p>
          </div>
        )
      })}

      <div className="flex items-center gap-3">
        <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={addPlainStat}>
          <Plus className="h-3 w-3" /> Add stat
        </button>
        {!('outDmgMods' in stats) && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => addDamageList('outDmgMods')}>
            + Outgoing damage by type
          </button>
        )}
        {!('inDmgMods' in stats) && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => addDamageList('inDmgMods')}>
            + Incoming damage by type
          </button>
        )}
      </div>
      {keys.length === 0 && <p className="text-xs text-muted-foreground">No stat effects.</p>}
      <datalist id="buff-damage-type-options">
        {COMMON_DAMAGE_TYPES.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  )
}
