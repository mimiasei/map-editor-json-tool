// ─── Artifact bonuses editor ────────────────────────────────────────────────
// Editable list for a custom artifact's `bonuses` array (Core/DB/items/items/
// *.json) — the mechanical effects a real artifact grants. Confirmed against
// every real artifact (13 files, ~185 items total): exactly 13 distinct
// `type` values, each with its own `parameters` shape. Typed sub-forms for
// the 5 most common/clear-cut types; a raw parameter-list fallback for the
// rest, so nothing is ever unrepresentable, just less convenient to hand-
// edit for the long tail — same "typed sub-forms + raw fallback" pattern
// EventBankLogicEditor already established for objects_logic rewards.
//
// Switching a bonus's type resets its parameters to that type's defaults and
// drops any other side fields the old type had (`upgrade`, `receivers`,
// `receiverAllegiance`, `activationLevel`) — same "blank on type change"
// behavior as EventBankLogicEditor's reward editor. Those side fields are
// otherwise preserved verbatim (only `parameters` is touched) since they're
// real, if secondary, per-level-scaling/targeting knobs some real bonuses use.

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import EntityCombobox from '@/components/common/EntityCombobox'
import StringListEditor from '@/components/common/StringListEditor'
import { BASIC_RESOURCE_IDS } from '@/lib/resources'
import { STAT_OPTIONS } from './EventBankLogicEditor'

type BonusKind = 'stat-amount' | 'resource-amount' | 'spell' | 'skill' | 'none' | 'raw'

// Confirmed against every real bonus across all 13 Core/DB/items/items/*.json
// files. The other 8 types (unitStat, battleSubskillBonus, heroMagicReplace,
// heroStatBattle, heroMagicAdditionMass, sideFactionRes,
// cityUnitsIncrementPer, unitBoolStat) fall back to 'raw' below — each has
// either a targeting sub-shape (receivers/receiverAllegiance) or multi-part
// parameters not worth a bespoke sub-form for how rarely they're used.
//
// heroStat is NOT a simple "one of 6 stats" type despite the name — real
// data has 30+ distinct first-parameter "stat keys" (magicSidSet,
// magicCounterSet, viewRadius, movementBonus, ...), most with a completely
// different parameter count/meaning than the 6 real hero stats (e.g.
// magicCounterSet is `[key, school, "0", "true", "false", "0"]`, 6 params,
// confirmed on ancient_idol_artifact). Only ~38% of real heroStat bonuses
// are the simple `[statId, amount]` shape. kindForBonus() below validates
// the ACTUAL parameters, not just the type name, before offering the typed
// form — otherwise the Select would silently show blank for the other 62%.
const BONUS_KIND_BY_TYPE: Record<string, BonusKind> = {
  heroStat: 'stat-amount',
  sideRes: 'resource-amount',
  heroMagicAddition: 'spell',
  heroTemporallyActiveSubSkills: 'skill',
  itemRandomRewardBonus: 'none',
}

const KNOWN_BONUS_TYPES = [
  'heroStat',
  'heroMagicAddition',
  'heroTemporallyActiveSubSkills',
  'unitStat',
  'battleSubskillBonus',
  'heroMagicReplace',
  'heroStatBattle',
  'heroMagicAdditionMass',
  'sideRes',
  'sideFactionRes',
  'cityUnitsIncrementPer',
  'itemRandomRewardBonus',
  'unitBoolStat',
]

const KNOWN_STAT_IDS = new Set(STAT_OPTIONS.map((s) => s.id))

// The type name alone isn't sufficient for heroStat (see comment above) — this
// also validates the real parameter shape, falling back to 'raw' when they
// don't match what the typed form expects instead of rendering it broken.
function kindForBonus(type: string, parameters: string[]): BonusKind {
  const kind = BONUS_KIND_BY_TYPE[type] ?? 'raw'
  if (kind === 'stat-amount' && !(parameters.length === 2 && KNOWN_STAT_IDS.has(parameters[0]))) {
    return 'raw'
  }
  return kind
}

function defaultParamsFor(type: string): string[] {
  switch (BONUS_KIND_BY_TYPE[type] ?? 'raw') {
    case 'stat-amount': return [STAT_OPTIONS[0].id, '1']
    case 'resource-amount': return [BASIC_RESOURCE_IDS[0], '0']
    case 'spell': return ['']
    case 'skill': return ['']
    case 'none': return []
    case 'raw': return []
  }
}

function blankBonus(type: string): Record<string, unknown> {
  return { type, parameters: defaultParamsFor(type) }
}

function BonusParamsEditor({ type, parameters, onChange }: {
  type: string
  parameters: string[]
  onChange: (parameters: string[]) => void
}) {
  const kind = kindForBonus(type, parameters)
  const set = (i: number, v: string) => {
    const next = parameters.slice()
    next[i] = v
    onChange(next)
  }

  switch (kind) {
    case 'stat-amount':
      return (
        <div className="flex items-center gap-2">
          <Select value={parameters[0] ?? STAT_OPTIONS[0].id} onValueChange={(v) => set(0, v)}>
            <SelectTrigger className="h-7 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAT_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="h-7 w-20 text-xs" value={parameters[1] ?? '0'} onChange={(e) => set(1, e.target.value)} />
        </div>
      )

    case 'resource-amount':
      return (
        <div className="flex items-center gap-2">
          <Select value={parameters[0] ?? BASIC_RESOURCE_IDS[0]} onValueChange={(v) => set(0, v)}>
            <SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BASIC_RESOURCE_IDS.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="h-7 w-24 text-xs" value={parameters[1] ?? '0'} onChange={(e) => set(1, e.target.value)} />
        </div>
      )

    case 'spell':
      return <EntityCombobox category="spell" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Spell…" />

    case 'skill':
      return <EntityCombobox category="skill" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Skill…" />

    case 'none':
      return <p className="text-xs text-muted-foreground">No parameters for this bonus type.</p>

    case 'raw':
    default:
      return <StringListEditor values={parameters} onChange={onChange} addLabel="+ Add parameter" placeholder="Raw parameter value" />
  }
}

interface ArtifactBonusesEditorProps {
  bonuses: Record<string, unknown>[]
  onChange: (bonuses: Record<string, unknown>[]) => void
}

export default function ArtifactBonusesEditor({ bonuses, onChange }: ArtifactBonusesEditorProps) {
  return (
    <div className="space-y-2">
      {bonuses.map((bonus, i) => {
        const type = typeof bonus.type === 'string' ? bonus.type : KNOWN_BONUS_TYPES[0]
        const parameters = Array.isArray(bonus.parameters) ? (bonus.parameters as string[]) : []
        return (
          <div key={i} className="rounded border border-border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={type}
                onValueChange={(v) => onChange(bonuses.map((b, idx) => (idx === i ? blankBonus(v) : b)))}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KNOWN_BONUS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(bonuses.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <BonusParamsEditor
              type={type}
              parameters={parameters}
              onChange={(parameters) => onChange(bonuses.map((b, idx) => (idx === i ? { ...b, parameters } : b)))}
            />
          </div>
        )
      })}
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => onChange([...bonuses, blankBonus(KNOWN_BONUS_TYPES[0])])}
      >
        + Add bonus
      </button>
      {bonuses.length === 0 && <p className="text-xs text-muted-foreground">No bonuses.</p>}
    </div>
  )
}
