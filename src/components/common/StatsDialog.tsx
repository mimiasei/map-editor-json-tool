import { useMemo, useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { ACTION_REGISTRY } from '@/schema/actions'
import { CONDITION_REGISTRY } from '@/schema/conditions'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestRow {
  questIndex: number
  sid: string
  subquests: number
  triggers: number
  actions: number
  conditions: number
  /** Weighted score: subquests×0.5 + triggers×1 + actions×1 + conditions×0.5 */
  complexity: number
}

type SortKey = keyof Omit<QuestRow, 'questIndex' | 'sid'>
type SortDir = 'asc' | 'desc'

type Tab = 'overview' | 'actions' | 'conditions' | 'perquest'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStats(scenario: ReturnType<typeof useScenarioStore.getState>['scenario']) {
  let totalSubquests = 0
  let totalTriggers = 0
  let totalActions = 0
  let totalConditions = 0

  // Action / condition frequency maps
  const actionFreq: Record<string, number> = {}
  const conditionFreq: Record<string, number> = {}

  // Interruption actions
  for (const intr of scenario.interruptions) {
    for (const a of intr.actions) {
      actionFreq[a.a] = (actionFreq[a.a] ?? 0) + 1
      totalActions++
    }
  }

  // Per-quest stats
  const questRows: QuestRow[] = scenario.quests.map((quest, qi) => {
    let qActions = 0
    let qConditions = 0
    let qTriggers = 0
    const qSubquests = quest.subQuests.length
    totalSubquests += qSubquests

    for (const sq of quest.subQuests) {
      qTriggers += sq.triggers.length
      totalTriggers += sq.triggers.length
      for (const tr of sq.triggers) {
        qActions += tr.actions.length
        qConditions += tr.conditions.length
        totalActions += tr.actions.length
        totalConditions += tr.conditions.length
        for (const a of tr.actions) {
          actionFreq[a.a] = (actionFreq[a.a] ?? 0) + 1
        }
        for (const c of tr.conditions) {
          conditionFreq[c.c] = (conditionFreq[c.c] ?? 0) + 1
        }
      }
    }

    const complexity =
      qSubquests * 0.5 + qTriggers * 1 + qActions * 1 + qConditions * 0.5

    return {
      questIndex: qi,
      sid: quest.sid,
      subquests: qSubquests,
      triggers: qTriggers,
      actions: qActions,
      conditions: qConditions,
      complexity,
    }
  })

  // Unique SIDs
  const sids = new Set<string>([
    ...scenario.counters.map((c) => c.sid),
    ...scenario.interruptions.map((i) => i.sid),
    ...scenario.quests.map((q) => q.sid),
    ...scenario.quests.flatMap((q) => q.subQuests.map((sq) => sq.sid)),
  ])

  // Total complexity
  const totalComplexity = questRows.reduce((s, r) => s + r.complexity, 0)

  // Sorted frequency tables
  const topActions = Object.entries(actionFreq)
    .sort((a, b) => b[1] - a[1])
  const topConditions = Object.entries(conditionFreq)
    .sort((a, b) => b[1] - a[1])

  return {
    counts: {
      quests: scenario.quests.length,
      subquests: totalSubquests,
      triggers: totalTriggers,
      actions: totalActions,
      conditions: totalConditions,
      counters: scenario.counters.length,
      interruptions: scenario.interruptions.length,
      uniqueSids: sids.size,
    },
    totalComplexity,
    questRows,
    topActions,
    topConditions,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3 flex flex-col gap-1 min-w-0">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function FreqBar({
  label,
  count,
  max,
  sublabel,
}: {
  label: string
  count: number
  max: number
  sublabel?: string
}) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 4
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-44 shrink-0 truncate text-xs text-right text-muted-foreground" title={label}>
        {sublabel ?? label}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="h-4 rounded-sm bg-primary/70" style={{ width: `${pct}%` }} />
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
    </div>
  )
}

// ─── Per-quest table ──────────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'subquests',  label: 'SQs',      title: 'Subquests' },
  { key: 'triggers',   label: 'Trigs',    title: 'Triggers' },
  { key: 'actions',    label: 'Acts',     title: 'Actions' },
  { key: 'conditions', label: 'Conds',    title: 'Conditions' },
  { key: 'complexity', label: 'Score',    title: 'Complexity score (SQs×0.5 + Triggers + Actions + Conditions×0.5)' },
]

function QuestTable({
  rows,
  onNavigate,
}: {
  rows: QuestRow[]
  onNavigate: (questIndex: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('complexity')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const maxComplexity = Math.max(1, ...rows.map((r) => r.complexity))

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="pb-2 pr-3 text-left font-medium">Quest SID</th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                role="button"
                tabIndex={0}
                className="pb-2 px-2 text-right font-medium cursor-pointer select-none hover:text-foreground transition-colors"
                title={col.title}
                onClick={() => handleSort(col.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSort(col.key)
                  }
                }}
              >
                {col.label}{arrow(col.key)}
              </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const barPct = Math.max(2, Math.round((row.complexity / maxComplexity) * 60))
            return (
              <tr
                key={row.questIndex}
                role="button"
                tabIndex={0}
                className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => onNavigate(row.questIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onNavigate(row.questIndex)
                  }
                }}
                title="Click to navigate to quest"
              >
                <td className="py-1.5 pr-3 font-mono max-w-[200px] truncate">
                  <span
                    className="inline-block h-2 rounded-sm bg-primary/40 mr-2 align-middle"
                    style={{ width: `${barPct}px` }}
                  />
                  {row.sid}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.subquests}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.triggers}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.actions}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.conditions}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{row.complexity.toFixed(1)}</td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-muted-foreground">
                No quests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function StatsDialog({ open, onOpenChange }: Props) {
  const scenario    = useScenarioStore((s) => s.scenario)
  const setSelection = useScenarioStore((s) => s.setSelection)

  const [tab, setTab] = useState<Tab>('overview')

  const stats = useMemo(() => computeStats(scenario), [scenario])

  const handleNavigate = (questIndex: number) => {
    setSelection('quest', [questIndex])
    onOpenChange(false)
  }

  const maxAction    = stats.topActions[0]?.[1]    ?? 1
  const maxCondition = stats.topConditions[0]?.[1] ?? 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[85vh]">
        <DialogTitle>Scenario Statistics</DialogTitle>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border pb-2 shrink-0">
          {(['overview', 'actions', 'conditions', 'perquest'] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? 'secondary' : 'ghost'}
              size="sm"
              className="capitalize"
              onClick={() => setTab(t)}
            >
              {t === 'perquest' ? 'Per Quest' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-6 py-2">
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Quests"        value={stats.counts.quests} />
                <StatCard label="Subquests"     value={stats.counts.subquests} />
                <StatCard label="Triggers"      value={stats.counts.triggers} />
                <StatCard label="Actions"       value={stats.counts.actions} />
                <StatCard label="Conditions"    value={stats.counts.conditions} />
                <StatCard label="Counters"      value={stats.counts.counters} />
                <StatCard label="Interruptions" value={stats.counts.interruptions} />
                <StatCard label="Unique SIDs"   value={stats.counts.uniqueSids} />
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-5 py-4 space-y-1">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold tabular-nums">
                    {stats.totalComplexity.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground">total complexity score</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Weighted sum across all quests: subquests × 0.5 + triggers × 1 + actions × 1 + conditions × 0.5.
                  Higher values indicate more elaborate scripting. Click <em>Per Quest</em> to identify hotspots.
                </p>
              </div>

              {stats.counts.triggers > 0 && (
                <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
                    <div className="text-lg font-semibold text-foreground tabular-nums">
                      {(stats.counts.actions / stats.counts.triggers).toFixed(1)}
                    </div>
                    avg actions / trigger
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
                    <div className="text-lg font-semibold text-foreground tabular-nums">
                      {(stats.counts.conditions / stats.counts.triggers).toFixed(1)}
                    </div>
                    avg conditions / trigger
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
                    <div className="text-lg font-semibold text-foreground tabular-nums">
                      {stats.counts.quests > 0
                        ? (stats.counts.subquests / stats.counts.quests).toFixed(1)
                        : '—'}
                    </div>
                    avg subquests / quest
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          {tab === 'actions' && (
            <div className="py-2 space-y-1.5">
              {stats.topActions.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No actions yet.</p>
              )}
              {stats.topActions.map(([type, count]) => (
                <FreqBar
                  key={type}
                  label={type}
                  sublabel={ACTION_REGISTRY[type]?.label ?? type}
                  count={count}
                  max={maxAction}
                />
              ))}
            </div>
          )}

          {/* ── Conditions ── */}
          {tab === 'conditions' && (
            <div className="py-2 space-y-1.5">
              {stats.topConditions.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No conditions yet.</p>
              )}
              {stats.topConditions.map(([type, count]) => (
                <FreqBar
                  key={type}
                  label={type}
                  sublabel={CONDITION_REGISTRY[type]?.label ?? type}
                  count={count}
                  max={maxCondition}
                />
              ))}
            </div>
          )}

          {/* ── Per Quest ── */}
          {tab === 'perquest' && (
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-3">
                Click a column header to sort. Click a row to navigate to that quest.
              </p>
              <QuestTable rows={stats.questRows} onNavigate={handleNavigate} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
