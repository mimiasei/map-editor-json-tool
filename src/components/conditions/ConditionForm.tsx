import type { Condition } from '@/types/scenario'
import { CONDITION_REGISTRY, CONDITION_LIST } from '@/schema/conditions'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import SidCombobox from '@/components/common/SidCombobox'
import EntityCombobox from '@/components/common/EntityCombobox'
import MapEntityCombobox from '@/components/common/MapEntityCombobox'
import HelpTooltip from '@/components/ui/HelpTooltip'

interface Props {
  condition: Condition
  onChange: (condition: Condition) => void
  onRemove: () => void
}

export default function ConditionForm({ condition, onChange, onRemove }: Props) {
  const def = CONDITION_REGISTRY[condition.c]
  const isCustom = !def
  const entities = useMapContextStore((s) => s.context?.entities)
  const entityCoordsMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities ?? []) {
      if (e.x !== undefined && e.z !== undefined) map.set(e.sid, `Map Coords: ${e.x}, ${e.z}`)
    }
    return map
  }, [entities])

  const updateType = (type: string) => {
    if (type === '__custom__') {
      onChange({ c: '', p: [] })
    } else {
      const newDef = CONDITION_REGISTRY[type]
      onChange({ c: type, p: newDef ? newDef.params.map(() => '') : [] })
    }
  }

  const updateParam = (i: number, val: string) => {
    const p = [...(condition.p ?? [])]
    p[i] = val
    onChange({ ...condition, p })
  }

  const addParam = () => onChange({ ...condition, p: [...(condition.p ?? []), ''] })
  const removeParam = (i: number) =>
    onChange({ ...condition, p: (condition.p ?? []).filter((_, j) => j !== i) })

  const selectValue = isCustom ? '__custom__' : condition.c

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-3">
      {/* Type selector */}
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Condition type</Label>
            {!isCustom && <HelpTooltip category="conditions" id={condition.c} />}
          </div>
          <div className="flex gap-2">
            <Select value={selectValue} onValueChange={updateType}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_LIST.map((c) => (
                  <SelectItem key={c.type} value={c.type}>
                    {c.label}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Custom / unknown type</SelectItem>
              </SelectContent>
            </Select>
            {isCustom && (
              <Input
                value={condition.c}
                onChange={(e) => onChange({ ...condition, c: e.target.value })}
                placeholder="Type string"
                className="flex-1"
              />
            )}
          </div>
          {def && (
            <p className="text-xs text-muted-foreground">{def.description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mt-4 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Known params */}
      {def && def.params.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {def.params.map((param, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">{param.label}</Label>
                <HelpTooltip category="conditions" id={condition.c} paramIndex={i} />
              </div>
              {param.type === 'enum' && param.options ? (
                <Select
                  value={(condition.p ?? [])[i] ?? ''}
                  onValueChange={(v) => updateParam(i, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={param.hint} />
                  </SelectTrigger>
                  <SelectContent>
                    {param.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : param.ref ? (
                <SidCombobox
                  value={(condition.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  refType={param.ref}
                  placeholder={param.hint}
                />
              ) : param.mapEntity ? (
                <>
                  <MapEntityCombobox
                    value={(condition.p ?? [])[i] ?? ''}
                    onChange={(v) => updateParam(i, v)}
                    placeholder={param.hint}
                  />
                  {(() => {
                    const coords = entityCoordsMap.get((condition.p ?? [])[i] ?? '')
                    return coords ? (
                      <span className="text-[10px] text-muted-foreground">{coords}</span>
                    ) : null
                  })()}
                </>
              ) : param.entity ? (
                <EntityCombobox
                  value={(condition.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  category={param.entity}
                  placeholder={param.hint}
                />
              ) : (
                <Input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={(condition.p ?? [])[i] ?? ''}
                  onChange={(e) => updateParam(i, e.target.value)}
                  placeholder={param.hint}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* StartTurn extra counter field */}
      {def?.extraFields && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {Object.entries(def.extraFields).map(([fieldName, fieldDef]) => (
            <div key={fieldName} className="space-y-1">
              <Label className="text-xs">{fieldDef.label}</Label>
              <Input
                type="number"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                value={(condition as any)[fieldName] ?? ''}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [fieldName]: e.target.value ? Number(e.target.value) : undefined,
                  } as any)
                }
                placeholder={fieldDef.hint}
                className="w-36"
              />
            </div>
          ))}
        </div>
      )}

      {/* Custom: raw params */}
      {isCustom && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Parameters (p)</Label>
            <button
              className="text-xs text-primary hover:underline"
              onClick={addParam}
            >
              + Add param
            </button>
          </div>
          {(condition.p ?? []).map((val, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={val}
                onChange={(e) => updateParam(i, e.target.value)}
                placeholder={`Param ${i + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeParam(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
