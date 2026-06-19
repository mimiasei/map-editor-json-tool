import { useMemo, useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import {
  buildTimeline,
  CATEGORY_META,
  type TimelineCategory,
  type TimelineEntry,
} from '@/lib/timeline'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Clock, Hash, Zap, Shuffle, Repeat2 } from 'lucide-react'

// ─── Category icons ───────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<TimelineCategory, React.ElementType> = {
  'turn-based':      Clock,
  'counter-gated':   Hash,
  'reactive':        Zap,
  'random-repeating': Shuffle,
}

// ─── Entry row ────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: TimelineEntry
  onClick: () => void
}

function EntryRow({ entry, onClick }: EntryRowProps) {
  const extraConditions = entry.conditions.length - 1

  return (
    <button
      className="w-full grid grid-cols-[minmax(0,5fr)_minmax(0,5fr)_minmax(0,4fr)] gap-x-4 items-center rounded-md px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
      onClick={onClick}
    >
      {/* When — first condition + overflow indicator */}
      <span className="truncate font-mono">
        {entry.conditionSummary}
        {extraConditions > 0 && (
          <span className="ml-1 text-muted-foreground">
            +{extraConditions} [{entry.conditionsLogic}]
          </span>
        )}
      </span>

      {/* Then — action summary */}
      <span className="truncate text-muted-foreground">
        {entry.actionSummary}
      </span>

      {/* Location — breadcrumb + repeat icon */}
      <div className="flex items-center gap-1.5 justify-end overflow-hidden">
        {entry.repeat && (
          <Repeat2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="repeating" />
        )}
        <span className="truncate text-muted-foreground text-right">
          {entry.questSid} › {entry.subQuestSid} › #{entry.triggerIndex + 1}
        </span>
      </div>
    </button>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  category: TimelineCategory
  entries: TimelineEntry[]
  onSelect: (entry: TimelineEntry) => void
}

function Section({ category, entries, onSelect }: SectionProps) {
  if (entries.length === 0) return null
  const meta = CATEGORY_META.find((m) => m.id === category)!
  const Icon = CATEGORY_ICONS[category]

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        <Badge variant="secondary" className="h-4 px-1.5 text-xs">
          {entries.length}
        </Badge>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,5fr)_minmax(0,4fr)] gap-x-4 px-3 pb-1 text-xs text-muted-foreground/50 uppercase tracking-wide select-none">
        <span>When</span>
        <span>Then</span>
        <span className="text-right">Location</span>
      </div>

      {/* Entry rows */}
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <EntryRow key={entry.key} entry={entry} onClick={() => onSelect(entry)} />
        ))}
      </div>
    </section>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface TimelineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TimelineDialog({ open, onOpenChange }: TimelineDialogProps) {
  const { scenario, setSelection } = useScenarioStore()
  const [closeOnNav, setCloseOnNav] = useState(false)

  const allEntries = useMemo(() => buildTimeline(scenario), [scenario])

  const grouped = useMemo(() => {
    const result: Record<TimelineCategory, TimelineEntry[]> = {
      'turn-based': [],
      'counter-gated': [],
      'reactive': [],
      'random-repeating': [],
    }
    for (const entry of allEntries) {
      result[entry.category].push(entry)
    }
    // Sort within each category
    for (const cat of Object.keys(result) as TimelineCategory[]) {
      result[cat].sort((a, b) => {
        const ak = a.sortKey
        const bk = b.sortKey
        if (typeof ak === 'number' && typeof bk === 'number') return ak - bk
        return String(ak).localeCompare(String(bk))
      })
    }
    return result
  }, [allEntries])

  const handleSelect = (entry: TimelineEntry) => {
    setSelection('trigger', entry.path)
    if (closeOnNav) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-w-4xl max-h-[85vh] p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Event Timeline</DialogTitle>

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b shrink-0">
          <div>
            <p className="text-base font-semibold leading-none">Event Timeline</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {allEntries.length} trigger{allEntries.length !== 1 ? 's' : ''} across{' '}
              {scenario.quests.length} quest{scenario.quests.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 mr-6">
            <Switch
              id="close-on-nav"
              checked={closeOnNav}
              onCheckedChange={setCloseOnNav}
            />
            <Label htmlFor="close-on-nav" className="text-xs text-muted-foreground cursor-pointer">
              Close on navigate
            </Label>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-4">
            {allEntries.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No triggers yet. Add quests with triggers to see them here.
              </p>
            ) : (
              <div className="space-y-6">
                {CATEGORY_META.map((cat) => (
                  <Section
                    key={cat.id}
                    category={cat.id}
                    entries={grouped[cat.id]}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
