import type { Action } from '@/types/scenario'
import { ACTION_REGISTRY, ACTION_LIST, ACTION_CATEGORIES } from '@/schema/actions'
import { useScenarioStore } from '@/store/useScenarioStore'
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
import { Trash2, ExternalLink } from 'lucide-react'
import SidCombobox from '@/components/common/SidCombobox'
import EntityCombobox from '@/components/common/EntityCombobox'
import HelpTooltip from '@/components/ui/HelpTooltip'

interface Props {
  action: Action
  onChange: (action: Action) => void
  onRemove: () => void
}

export default function ActionForm({ action, onChange, onRemove }: Props) {
  const def = ACTION_REGISTRY[action.a]
  const isCustom = !def
  const { openDialogEditor } = useScenarioStore()

  /** True when this action references a dialog key we can open in the editor */
  const isDialogAction = action.a === 'Dialog' || action.a === 'RandomDialog'
  const dialogKey = isDialogAction ? (action.p ?? [])[0] : undefined

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
                {ACTION_CATEGORIES.map((cat) => (
                  <SelectGroup key={cat}>
                    <SelectLabel>{cat}</SelectLabel>
                    {ACTION_LIST.filter((a) => a.category === cat).map((a) => (
                      <SelectItem key={a.type} value={a.type}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
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
                <HelpTooltip category="actions" id={action.a} paramIndex={i} />
              </div>
              {param.type === 'enum' && param.options ? (
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
              ) : param.ref ? (
                <SidCombobox
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  refType={param.ref}
                  placeholder={param.hint}
                />
              ) : param.entity ? (
                <EntityCombobox
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(v) => updateParam(i, v)}
                  category={param.entity}
                  placeholder={param.hint}
                />
              ) : (
                <Input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={(action.p ?? [])[i] ?? ''}
                  onChange={(e) => updateParam(i, e.target.value)}
                  placeholder={param.hint}
                />
              )}
              {/* "Edit dialog →" button shown next to the key param of Dialog/RandomDialog */}
              {isDialogAction && i === 0 && dialogKey && (
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  onClick={() => openDialogEditor(dialogKey)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Edit dialog
                </button>
              )}
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
    </div>
  )
}
