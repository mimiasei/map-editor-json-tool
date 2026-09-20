import type { Condition } from '@/types/scenario'
import { CONDITION_REGISTRY, CONDITION_LIST } from '@/schema/conditions'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { resolveCastleFaction, getBuildingOptions, getBuildingLevelNames } from '@/lib/building-options'
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
import { MapPin, Trash2 } from 'lucide-react'
import SidCombobox from '@/components/common/SidCombobox'
import EntityCombobox from '@/components/common/EntityCombobox'
import MapEntityCombobox from '@/components/common/MapEntityCombobox'
import HelpTooltip from '@/components/ui/HelpTooltip'

interface Props {
  condition: Condition
  onChange: (condition: Condition) => void
  onRemove: () => void
  /** "Pick from map" button next to mapEntity/hero fields — switches to Map
   *  Grid, then returns here with the clicked object's SID filled in. Omitted
   *  entirely when absent (e.g. inside the subject-first seeding flow, which
   *  doesn't have a resume point to return to). */
  onPickFromMap?: (paramIndex: number, kind: 'mapEntity' | 'hero') => void
}

export default function ConditionForm({ condition, onChange, onRemove, onPickFromMap }: Props) {
  const def = CONDITION_REGISTRY[condition.c]
  const isCustom = !def
  const entities = useMapContextStore((s) => s.context?.entities)
  const placedObjects = useMapContextStore((s) => s.context?.placedObjects)
  const catalog = useCatalogStore((s) => s.catalog)
  const entityCoordsMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entities ?? []) {
      if (e.x !== undefined && e.z !== undefined) map.set(e.sid, `Map Coords: ${e.x}, ${e.z}`)
    }
    return map
  }, [entities])

  const buildingSidIndex = def?.params.findIndex((p) => p.buildingSid) ?? -1
  const castleEntitySid =
    buildingSidIndex >= 0 ? (condition.p ?? [])[buildingSidIndex + 2] : undefined
  const castleFaction = useMemo(
    () => resolveCastleFaction(placedObjects, castleEntitySid),
    [placedObjects, castleEntitySid],
  )
  const buildingOptions = useMemo(
    () => getBuildingOptions(catalog, castleFaction),
    [catalog, castleFaction],
  )
  const selectedBuildingSid = buildingSidIndex >= 0 ? (condition.p ?? [])[buildingSidIndex] : undefined
  const buildingLevelNames = useMemo(
    () => getBuildingLevelNames(catalog, selectedBuildingSid, castleFaction),
    [catalog, selectedBuildingSid, castleFaction],
  )

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
          {def.params.map((param, i) => {
            const isBuildingLevelParam = buildingSidIndex >= 0 && i === buildingSidIndex + 1
            const buildingLevelOptions =
              isBuildingLevelParam && buildingLevelNames.length > 0
                ? buildingLevelNames.map((name, idx) => ({ value: String(idx + 1), label: name }))
                : undefined
            return (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-1">
                <Label className="text-xs">{param.label}</Label>
                <HelpTooltip category="conditions" id={condition.c} paramIndex={i} />
              </div>
              {param.buildingSid && buildingOptions.length > 0 ? (
                <Select
                  value={(condition.p ?? [])[i] ?? ''}
                  onValueChange={(v) => updateParam(i, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={param.hint} />
                  </SelectTrigger>
                  <SelectContent>
                    {buildingOptions.map((b) => (
                      <SelectItem key={b.sid} value={b.sid}>
                        {b.levelNames[0] ?? b.sid}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : buildingLevelOptions ? (
                <Select
                  value={(condition.p ?? [])[i] ?? ''}
                  onValueChange={(v) => updateParam(i, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={param.hint} />
                  </SelectTrigger>
                  <SelectContent>
                    {buildingLevelOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value} – {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : param.type === 'enum' && param.options ? (
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
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <MapEntityCombobox
                        value={(condition.p ?? [])[i] ?? ''}
                        onChange={(v) => updateParam(i, v)}
                        placeholder={param.hint}
                      />
                    </div>
                    {onPickFromMap && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        title="Pick from map"
                        onClick={() => onPickFromMap(i, 'mapEntity')}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {(() => {
                    const coords = entityCoordsMap.get((condition.p ?? [])[i] ?? '')
                    return coords ? (
                      <span className="text-[10px] text-muted-foreground">{coords}</span>
                    ) : null
                  })()}
                </>
              ) : param.entity ? (
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <EntityCombobox
                      value={(condition.p ?? [])[i] ?? ''}
                      onChange={(v) => updateParam(i, v)}
                      category={param.entity}
                      placeholder={param.hint}
                    />
                  </div>
                  {param.entity === 'hero' && onPickFromMap && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Pick a hero spawner from the map"
                      onClick={() => onPickFromMap(i, 'hero')}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <Input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={(condition.p ?? [])[i] ?? ''}
                  onChange={(e) => updateParam(i, e.target.value)}
                  placeholder={param.hint}
                />
              )}
            </div>
            )
          })}
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
