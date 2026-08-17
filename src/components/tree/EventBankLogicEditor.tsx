// ─── Event-bank native behavior editor ────────────────────────────────────────
// Custom Map Object "Build from scratch" mode lets a user attach a *verbatim
// clone* of another object's objects_logic entry as native behavior. This
// component makes that clone's settings actually editable — but only for the
// one family shape that's internally consistent enough to support a generic
// form: Core/DB/objects_logic/event_banks/**/*.json ("banks" — visit, roll a
// weighted variant, grant a rewardSet). Every other family (chests, res_mines,
// cities, ...) has a genuinely different, bespoke shape (confirmed by direct
// inspection — see plans/interactable-object-categories.md) and stays a
// verbatim, unedited clone; CustomObjectEditorDialog decides which case
// applies via `isEventBankLogic` and shows a plain "can't edit here" note
// otherwise.
//
// Scope, deliberately bounded rather than exhaustively modeling every field:
// - Only single-variant behaviors are editable (`variants.length === 1`) —
//   most real bank objects work this way; multi-variant (weighted random
//   outcome) objects ship unchanged with a read-only note, since editing a
//   weighted variant SET is a materially bigger form than editing one.
// - Top-level `visitType` and the one variant's `guardUnits`/`rewardSet.rewards`
//   are editable; `tooltipVisitType`/`variantRerollType`/`visitorsResetType`
//   and rare per-family flags (`aiIgnore`, `applyDifficultyModifier`,
//   `canAIVisitUnlimited`) are preserved verbatim, not exposed — they're
//   secondary tuning knobs, not what anyone customizing a reward usually
//   wants to touch.
// - Reward parameters get a typed sub-form for the ~11 reward types that
//   dominate real usage by a wide margin (confirmed by counting every
//   rewardType across all 183 real event_banks files) — everything else
//   (including any reward type not seen at all) falls back to a raw
//   string-list editor, so nothing is ever unrepresentable, just less
//   convenient to hand-edit for the long tail.
// - Stat ids/labels (offence/defence/spellPower/intelligence/luck/moral →
//   Attack/Defense/Spell Power/Knowledge/Luck/Morale) reuse the exact same
//   6-value enum already used elsewhere in this codebase
//   (src/schema/conditions.ts's HeroStat condition) and are cross-checked
//   against real Core/Lang/english loc text, not guessed.

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Trash2 } from 'lucide-react'
import EntityCombobox from '@/components/common/EntityCombobox'
import StringListEditor from '@/components/common/StringListEditor'
import { BASIC_RESOURCE_IDS } from '@/lib/resources'

// ─── Shape detection ───────────────────────────────────────────────────────────

export function isEventBankLogic(raw: Record<string, unknown> | undefined): boolean {
  return !!raw && typeof raw.visitType === 'string' && Array.isArray(raw.variants)
}

// ─── Reward type -> parameter form kind ────────────────────────────────────────
// Confirmed against every rewardType actually used across all 183 real
// Core/DB/objects_logic/event_banks/**/*.json files (11 subfolders). Any
// rewardType not listed here (a family this table hasn't seen, or a future
// game update) falls back to 'raw' — still fully editable, just as a plain
// parameter string list instead of a typed sub-form.

type RewardKind =
  | 'none' | 'amount' | 'fraction' | 'boolean' | 'resource-pairs'
  | 'creature-amount' | 'stat-amount' | 'rarity' | 'skill-boolean'
  | 'artifact' | 'buff-duration-amount' | 'raw'

const REWARD_KIND_BY_TYPE: Record<string, RewardKind> = {
  SideResReward: 'resource-pairs',
  SidePropResReward: 'none',
  HeroRandomItemsReward: 'rarity',
  HeroBuffReward: 'buff-duration-amount',
  HeroPropItemReward: 'none',
  HeroUnitsReward: 'creature-amount',
  HeroMagicPropAdditionReward: 'none',
  MovePointsAdditionReward: 'amount',
  HeroSkillAdditionReward: 'skill-boolean',
  HeroStatsReward: 'stat-amount',
  SidePropUnitReward: 'none',
  HeroMagicRandomAdditionReward: 'raw',
  HeroSkillRandomAdditionReward: 'raw',
  HeroSkillPropAdditionReward: 'none',
  SideRandomBuffReward: 'raw',
  HeroExpReward: 'amount',
  MovePointsPercentAdditionReward: 'fraction',
  SideRemoveFogOfWarAroundAllBuildByType: 'raw',
  ManaPercentSettingReward: 'amount',
  SideFogOfWarRevealing: 'amount',
  LearnRemotelySideMagics: 'none',
  SideRestoreGrowthReward: 'amount',
  HeroSkillLevelUpReward: 'none',
  HeroItemReward: 'artifact',
  SidePropBuffReward: 'none',
  ManaPercentAdditionReward: 'raw',
  HeroExpToLevelUpReward: 'boolean',
}
const KNOWN_REWARD_TYPES = Object.keys(REWARD_KIND_BY_TYPE)

// Confirmed against Core/Lang/english/texts/ui.json (college_of_wonder_reward_*/
// unitStat_* sids) — not guessed.
const STAT_OPTIONS = [
  { id: 'offence', label: 'Attack' },
  { id: 'defence', label: 'Defense' },
  { id: 'spellPower', label: 'Spell Power' },
  { id: 'intelligence', label: 'Knowledge' },
  { id: 'luck', label: 'Luck' },
  { id: 'moral', label: 'Morale' },
]

// Confirmed against every real HeroRandomItemsReward parameter across
// event_banks (common/rare/epic/legendary, always lowercase).
const RARITY_OPTIONS = ['common', 'rare', 'epic', 'legendary']

function defaultParamsFor(rewardType: string): string[] {
  switch (REWARD_KIND_BY_TYPE[rewardType] ?? 'raw') {
    case 'none': return []
    case 'amount': case 'fraction': return ['0']
    case 'boolean': return ['true']
    case 'resource-pairs': return [BASIC_RESOURCE_IDS[0], '0']
    case 'creature-amount': return ['', '1']
    case 'stat-amount': return [STAT_OPTIONS[0].id, '0']
    case 'rarity': return [RARITY_OPTIONS[0]]
    case 'skill-boolean': return ['', 'true']
    case 'artifact': return ['']
    case 'buff-duration-amount': return ['', 'Infinite', '0']
    case 'raw': return []
  }
}

function blankReward(rewardType: string): Record<string, unknown> {
  return {
    rewardType,
    rewardShowType: 'Invisible',
    applyRewardFloating: true,
    rewardIcon: 'default',
    rewardName: 'default',
    rewardDesc: 'default',
    rewardNotificationDesc: 'default',
    parameters: defaultParamsFor(rewardType),
  }
}

// ─── Small shared bits ─────────────────────────────────────────────────────────

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function BoolToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1.5">
      <Button type="button" variant={value ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => onChange(true)}>Yes</Button>
      <Button type="button" variant={!value ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => onChange(false)}>No</Button>
    </div>
  )
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={onClick}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}

// ─── Reward parameter sub-forms ────────────────────────────────────────────────

function RewardParamsEditor({ rewardType, parameters, onChange }: {
  rewardType: string
  parameters: string[]
  onChange: (parameters: string[]) => void
}) {
  const kind = REWARD_KIND_BY_TYPE[rewardType] ?? 'raw'
  const set = (i: number, v: string) => {
    const next = parameters.slice()
    next[i] = v
    onChange(next)
  }

  switch (kind) {
    case 'none':
      return <p className="text-xs text-muted-foreground">No parameters for this reward type.</p>

    case 'amount':
      return (
        <Input type="number" className="h-7 w-28 text-xs" value={parameters[0] ?? '0'} onChange={(e) => set(0, e.target.value)} />
      )

    case 'fraction':
      return (
        <Input type="number" step="0.1" className="h-7 w-28 text-xs" value={parameters[0] ?? '0'} onChange={(e) => set(0, e.target.value)} />
      )

    case 'boolean':
      return <BoolToggle value={parameters[0] === 'true'} onChange={(v) => set(0, v ? 'true' : 'false')} />

    case 'resource-pairs': {
      const pairs: [string, string][] = []
      for (let i = 0; i < parameters.length; i += 2) pairs.push([parameters[i] ?? BASIC_RESOURCE_IDS[0], parameters[i + 1] ?? '0'])
      const updatePairs = (next: [string, string][]) => onChange(next.flat())
      return (
        <div className="space-y-1.5">
          {pairs.map(([resource, amount], i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={resource} onValueChange={(v) => updatePairs(pairs.map((p, idx) => (idx === i ? [v, p[1]] : p)))}>
                <SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BASIC_RESOURCE_IDS.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" className="h-7 w-24 text-xs" value={amount} onChange={(e) => updatePairs(pairs.map((p, idx) => (idx === i ? [p[0], e.target.value] : p)))} />
              <RemoveRowButton onClick={() => updatePairs(pairs.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => updatePairs([...pairs, [BASIC_RESOURCE_IDS[0], '0']])}>+ Add resource</button>
        </div>
      )
    }

    case 'creature-amount':
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><EntityCombobox category="creature" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Creature…" /></div>
          <Input type="number" className="h-7 w-20 text-xs shrink-0" value={parameters[1] ?? '1'} onChange={(e) => set(1, e.target.value)} />
        </div>
      )

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

    case 'rarity':
      return (
        <Select value={parameters[0] ?? RARITY_OPTIONS[0]} onValueChange={(v) => set(0, v)}>
          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RARITY_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      )

    case 'skill-boolean':
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><EntityCombobox category="skill" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Skill…" /></div>
          <BoolToggle value={parameters[1] === 'true'} onChange={(v) => set(1, v ? 'true' : 'false')} />
        </div>
      )

    case 'artifact':
      return <EntityCombobox category="artifact" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Artifact…" />

    case 'buff-duration-amount':
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><EntityCombobox category="buff" value={parameters[0] ?? ''} onChange={(v) => set(0, v)} placeholder="Buff…" /></div>
          <Input className="h-7 w-32 text-xs" value={parameters[1] ?? 'Infinite'} onChange={(e) => set(1, e.target.value)} placeholder="Infinite" title="Duration type — real examples: Infinite, UntilNextWeek, ForSeveralDays" />
          <Input type="number" className="h-7 w-16 text-xs" value={parameters[2] ?? '0'} onChange={(e) => set(2, e.target.value)} />
        </div>
      )

    case 'raw':
    default:
      return <StringListEditor values={parameters} onChange={onChange} addLabel="+ Add parameter" placeholder="Raw parameter value" />
  }
}

// ─── Main editor ────────────────────────────────────────────────────────────────

const VISIT_TYPES = ['Unlimited', 'OneTime', 'EachHeroOneTime', 'EachSideOneTime']

interface Props {
  raw: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

export default function EventBankLogicEditor({ raw, onChange }: Props) {
  const variants = Array.isArray(raw.variants) ? (raw.variants as Record<string, unknown>[]) : []

  if (variants.length !== 1) {
    return (
      <p className="text-xs text-muted-foreground">
        This behavior has {variants.length} weighted variants — editing multi-variant behavior isn't
        supported here, so it ships unchanged.
      </p>
    )
  }

  const variant = variants[0]
  const updateVariant = (patch: Record<string, unknown>) => onChange({ ...raw, variants: [{ ...variant, ...patch }] })

  const guardUnits = Array.isArray(variant.guardUnits) ? (variant.guardUnits as Record<string, unknown>[]) : []
  const updateGuardUnits = (next: Record<string, unknown>[]) => updateVariant({ guardUnits: next })

  const rewardSet = (variant.rewardSet && typeof variant.rewardSet === 'object' ? variant.rewardSet : {}) as Record<string, unknown>
  const rewards = Array.isArray(rewardSet.rewards) ? (rewardSet.rewards as Record<string, unknown>[]) : []
  const updateRewards = (next: Record<string, unknown>[]) => updateVariant({ rewardSet: { ...rewardSet, rewards: next } })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Visit type</Label>
        <Select value={str(raw.visitType, VISIT_TYPES[0])} onValueChange={(v) => onChange({ ...raw, visitType: v })}>
          <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VISIT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Guard units</Label>
        <div className="space-y-1.5">
          {guardUnits.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <EntityCombobox
                  category="creature"
                  value={str(g.sid)}
                  onChange={(v) => updateGuardUnits(guardUnits.map((u, idx) => (idx === i ? { ...u, sid: v } : u)))}
                  placeholder="Creature…"
                />
              </div>
              <Input
                type="number"
                className="h-7 w-20 text-xs shrink-0"
                value={typeof g.amount === 'number' ? g.amount : Number(g.amount) || 0}
                onChange={(e) => updateGuardUnits(guardUnits.map((u, idx) => (idx === i ? { ...u, amount: Number(e.target.value) || 0 } : u)))}
              />
              <RemoveRowButton onClick={() => updateGuardUnits(guardUnits.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => updateGuardUnits([...guardUnits, { sid: '', amount: 1 }])}>
            + Add guard
          </button>
          {guardUnits.length === 0 && <p className="text-xs text-muted-foreground">No guard — visiting is unopposed.</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Rewards</Label>
        <div className="space-y-2">
          {rewards.map((reward, i) => {
            const rewardType = str(reward.rewardType, KNOWN_REWARD_TYPES[0])
            return (
              <div key={i} className="rounded border border-border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={rewardType}
                    onValueChange={(v) => updateRewards(rewards.map((r, idx) => (idx === i ? blankReward(v) : r)))}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KNOWN_REWARD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <RemoveRowButton onClick={() => updateRewards(rewards.filter((_, idx) => idx !== i))} />
                </div>
                <RewardParamsEditor
                  rewardType={rewardType}
                  parameters={Array.isArray(reward.parameters) ? (reward.parameters as string[]) : []}
                  onChange={(parameters) => updateRewards(rewards.map((r, idx) => (idx === i ? { ...r, parameters } : r)))}
                />
              </div>
            )
          })}
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => updateRewards([...rewards, blankReward(KNOWN_REWARD_TYPES[0])])}>
            + Add reward
          </button>
          {rewards.length === 0 && <p className="text-xs text-muted-foreground">No rewards.</p>}
        </div>
      </div>
    </div>
  )
}
