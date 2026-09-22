import type { Action } from '@/types/scenario'
import { ACTION_REGISTRY, ACTION_LIST, ACTION_CATEGORIES } from '@/schema/actions'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { resolveCastleFaction, getBuildingOptions, getBuildingLevelNames } from '@/lib/building-options'
import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MapPin, Trash2, ExternalLink, ClipboardCopy } from 'lucide-react'
import SidCombobox from '@/components/common/SidCombobox'
import DialogSidField from '@/components/common/DialogSidField'
import EntityCombobox from '@/components/common/EntityCombobox'
import MapEntityCombobox from '@/components/common/MapEntityCombobox'
import HelpTooltip from '@/components/ui/HelpTooltip'
import { isTauri } from '@/lib/native-fs'
import { copyToClipboard } from '@/lib/clipboard'
import { useDialogActionCascadeGuard } from '@/hooks/useDialogActionCascadeGuard'

interface Props {
  action: Action
  onChange: (action: Action) => void
  onRemove: () => void
  /** "Pick from map" button next to mapEntity/hero fields — see ConditionForm's
   *  identical prop for the full explanation. */
  onPickFromMap?: (paramIndex: number, kind: 'mapEntity' | 'hero' | 'node') => void
  /** Narrows the type dropdown to a documented-valid subset for this specific
   *  field (e.g. a dialog's restricted "Global" actions block) — the "Custom /
   *  unknown type" escape hatch stays available regardless, so an already-set
   *  type outside the filter is never made unrepresentable, just not offered
   *  as a fresh pick. */
  typeFilter?: (type: string) => boolean
}

export default function ActionForm({ action, onChange, onRemove, onPickFromMap, typeFilter }: Props) {
  const def = ACTION_REGISTRY[action.a]
  const isCustom = !def
  const { openDialogEditor } = useScenarioStore()
  const cascadeGuard = useDialogActionCascadeGuard()
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
    buildingSidIndex >= 0 ? (action.p ?? [])[buildingSidIndex + 2] : undefined
  const castleFaction = useMemo(
    () => resolveCastleFaction(placedObjects, castleEntitySid),
    [placedObjects, castleEntitySid],
  )
  const buildingOptions = useMemo(
    () => getBuildingOptions(catalog, castleFaction),
    [catalog, castleFaction],
  )
  const selectedBuildingSid = buildingSidIndex >= 0 ? (action.p ?? [])[buildingSidIndex] : undefined
  const buildingLevelNames = useMemo(
    () => getBuildingLevelNames(catalog, selectedBuildingSid, castleFaction),
    [catalog, selectedBuildingSid, castleFaction],
  )

  const updateType = (type: string) => {
    if (type === '__custom__') {
      onChange({ a: '', p: [] })
    } else {
      const newDef = ACTION_REGISTRY[type]
      onChange({ a: type, p: newDef ? newDef.params.map(() => '') : [] })
    }
  }

  const updateParam = (i: number, val: string) => {
    const p = [...(action.p ?? [])]
    p[i] = val
    onChange({ ...action, p })
  }

  const addParam = () => onChange({ ...action, p: [...(action.p ?? []), ''] })
  const removeParam = (i: number) =>
    onChange({ ...action, p: (action.p ?? []).filter((_, j) => j !== i) })

  const selectValue = isCustom ? '__custom__' : action.a

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-3">
      {/* Type selector */}
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Action type</Label>
            {!isCustom && <HelpTooltip category="actions" id={action.a} />}
          </div>
          <div className="flex gap-2">
            <Select value={selectValue} onValueChange={updateType}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_CATEGORIES.map((cat) => {
                  const inCategory = ACTION_LIST.filter(
                    (a) => a.category === cat && (!typeFilter || typeFilter(a.type)),
                  )
                  if (inCategory.length === 0) return null
                  return (
                    <SelectGroup key={cat}>
                      <SelectLabel>{cat}</SelectLabel>
                      {inCategory.map((a) => (
                        <SelectItem key={a.type} value={a.type}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  <SelectItem value="__custom__">Custom / unknown type</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {isCustom && (
              <Input
                value={action.a}
                onChange={(e) => onChange({ ...action, a: e.target.value })}
                placeholder="Type string"
                className="flex-1"
              />
            )}
          </div>
          {def && (
            <p className="text-xs text-muted-foreground">{def.description}</p>
          )}
        </div>
        {isTauri() && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 mt-4 text-muted-foreground hover:text-primary"
            onClick={() => copyToClipboard('action', action)}
            title="Copy action to clipboard"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mt-4 text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (cascadeGuard(action)) onRemove()
          }}
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
                <HelpTooltip category="actions" id={action.a} paramIndex={i} />
              </div>
              {param.buildingSid && buildingOptions.length > 0 ? (
                <Select
                  value={(action.p ?? [])[i] ?? ''}
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
                  value={(action.p ?? [])[i] ?? ''}
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
                  value={(action.p ?? [])[i] ?? ''}
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
              ) : param.ref === 'dialog' ? (
                <DialogSidField
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  placeholder={param.hint}
                />
              ) : param.ref ? (
                <SidCombobox
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  refType={param.ref}
                  placeholder={param.hint}
                />
              ) : param.mapEntity ? (
                <>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <MapEntityCombobox
                        value={(action.p ?? [])[i] ?? ''}
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
                    const coords = entityCoordsMap.get((action.p ?? [])[i] ?? '')
                    return coords ? (
                      <span className="text-[10px] text-muted-foreground">{coords}</span>
                    ) : null
                  })()}
                </>
              ) : param.entity ? (
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <EntityCombobox
                      value={(action.p ?? [])[i] ?? ''}
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
              ) : param.nodeIndex ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    value={(action.p ?? [])[i] ?? ''}
                    onChange={(e) => updateParam(i, e.target.value)}
                    placeholder={param.hint}
                    className="flex-1 min-w-0"
                  />
                  {onPickFromMap && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Pick a node from the map"
                      onClick={() => onPickFromMap(i, 'node')}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <Input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(e) => updateParam(i, e.target.value)}
                  placeholder={param.hint}
                />
              )}
              {/* "Edit dialog →" button shown next to any populated dialog-ref param */}
              {param.ref === 'dialog' && (action.p ?? [])[i] && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center gap-1.5"
                  onClick={() => openDialogEditor((action.p ?? [])[i])}
                >
                  <ExternalLink className="h-4 w-4" />
                  Edit dialog
                </Button>
              )}
            </div>
            )
          })}
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
          {(action.p ?? []).map((val, i) => (
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

      {/* Break flag */}
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={action.break ?? false}
          onCheckedChange={(checked) =>
            onChange({ ...action, break: checked === true ? true : undefined })
          }
        />
        <span className="text-xs">
          Break — stop executing subsequent actions if this action runs
        </span>
      </label>
    </div>
  )
}
