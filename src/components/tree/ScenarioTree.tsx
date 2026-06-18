import { useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Hash,
  Zap,
  BookOpen,
  List,
  Layers,
} from 'lucide-react'

// ─── Tree node button ───────────────────────────────────────────────────────────
function truncSid(s: string): string {
  if (!s) return '(unnamed)'
  return s.length > 25 ? s.slice(0, 23) + '..' : s
}

function TreeItem({
  label,
  depth = 0,
  selected = false,
  onClick,
  onDelete,
  icon,
  muted = false,
}: {
  label: string
  depth?: number
  selected?: boolean
  onClick?: () => void
  onDelete?: () => void
  icon?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-1 rounded px-1 py-0.5 text-sm cursor-pointer select-none overflow-hidden',
        selected ? 'bg-primary/20 text-primary' : 'hover:bg-accent',
        muted && 'text-muted-foreground',
        onDelete && 'pr-6',
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={onClick}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      <span className="flex-1 truncate">{truncSid(label)}</span>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

// ─── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({
  label,
  count,
  open,
  onToggle,
  onAdd,
  icon,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  onAdd: () => void
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      <button
        className="flex flex-1 items-center gap-1 text-sm font-semibold text-foreground hover:text-primary"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {icon}
        <span>{label}</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground">({count})</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-muted-foreground hover:text-primary"
        onClick={onAdd}
        title={`Add ${label}`}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Main tree ──────────────────────────────────────────────────────────────────
export default function ScenarioTree() {
  const {
    scenario,
    selectedType,
    selectedPath,
    setSelection,
    addCounter,
    removeCounter,
    addInterruption,
    removeInterruption,
    addQuest,
    removeQuest,
    addSubQuest,
    removeSubQuest,
    addTrigger,
    removeTrigger,
  } = useScenarioStore()

  const [openSections, setOpenSections] = useState({
    counters: true,
    interruptions: true,
    quests: true,
  })
  const [openQuests, setOpenQuests] = useState<Record<number, boolean>>({})
  const [openSubQuests, setOpenSubQuests] = useState<Record<string, boolean>>({})

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }))

  const toggleQuest = (i: number) =>
    setOpenQuests((s) => ({ ...s, [i]: !s[i] }))

  const toggleSubQuest = (qi: number, sqi: number) =>
    setOpenSubQuests((s) => ({ ...s, [`${qi}-${sqi}`]: !s[`${qi}-${sqi}`] }))

  const isSelected = (type: string, ...path: number[]) =>
    selectedType === type && path.every((v, i) => selectedPath[i] === v)

  return (
    <ScrollArea className="flex-1 py-2">
      <div className="min-w-0 px-1 pb-4">
        {/* ── Counters ── */}
        <SectionHeader
          label="Counters"
          count={scenario.counters.length}
          open={openSections.counters}
          onToggle={() => toggleSection('counters')}
          onAdd={addCounter}
          icon={<Hash className="h-3.5 w-3.5" />}
        />
        {openSections.counters &&
          scenario.counters.map((counter, i) => (
            <TreeItem
              key={i}
              label={counter.sid}
              depth={1}
              selected={isSelected('counter', i)}
              onClick={() => setSelection('counter', [i])}
              onDelete={() => removeCounter(i)}
              icon={<Hash className="h-3 w-3" />}
            />
          ))}

        {/* ── Interruptions ── */}
        <div className="mt-1">
          <SectionHeader
            label="Interruptions"
            count={scenario.interruptions.length}
            open={openSections.interruptions}
            onToggle={() => toggleSection('interruptions')}
            onAdd={addInterruption}
            icon={<Zap className="h-3.5 w-3.5" />}
          />
          {openSections.interruptions &&
            scenario.interruptions.map((intr, i) => (
              <TreeItem
                key={i}
                label={intr.sid}
                depth={1}
                selected={isSelected('interruption', i)}
                onClick={() => setSelection('interruption', [i])}
                onDelete={() => removeInterruption(i)}
                icon={<Zap className="h-3 w-3" />}
              />
            ))}
        </div>

        {/* ── Quests ── */}
        <div className="mt-1">
          <SectionHeader
            label="Quests"
            count={scenario.quests.length}
            open={openSections.quests}
            onToggle={() => toggleSection('quests')}
            onAdd={addQuest}
            icon={<BookOpen className="h-3.5 w-3.5" />}
          />
          {openSections.quests &&
            scenario.quests.map((quest, qi) => {
              const questOpen = openQuests[qi] ?? false
              return (
                <div key={qi}>
                  {/* Quest row */}
                  <div
                    className={cn(
                      'group relative flex items-center gap-0.5 rounded px-1 py-0.5 pr-6 text-sm cursor-pointer select-none overflow-hidden',
                      isSelected('quest', qi) ? 'bg-primary/20 text-primary' : 'hover:bg-accent',
                    )}
                    style={{ paddingLeft: '22px' }}
                    onClick={() => setSelection('quest', [qi])}
                  >
                    <button
                      className="shrink-0 p-0.5 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleQuest(qi)
                      }}
                    >
                      {questOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="ml-1 flex-1 truncate">{truncSid(quest.sid)}</span>
                    {quest.main && (
                      <span className="text-xs text-primary/70 mr-1">main</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeQuest(qi)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* SubQuests */}
                  {questOpen &&
                    quest.subQuests.map((subQuest, sqi) => {
                      const subKey = `${qi}-${sqi}`
                      const subOpen = openSubQuests[subKey] ?? false
                      return (
                        <div key={sqi}>
                          {/* SubQuest row */}
                          <div
                            className={cn(
                              'group relative flex items-center gap-0.5 rounded px-1 py-0.5 pr-6 text-sm cursor-pointer select-none overflow-hidden',
                              isSelected('subquest', qi, sqi)
                                ? 'bg-primary/20 text-primary'
                                : 'hover:bg-accent',
                            )}
                            style={{ paddingLeft: '36px' }}
                            onClick={() => setSelection('subquest', [qi, sqi])}
                          >
                            <button
                              className="shrink-0 p-0.5 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSubQuest(qi, sqi)
                              }}
                            >
                              {subOpen ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                            <List className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="ml-1 flex-1 truncate">
                              sq: {truncSid(subQuest.sid)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeSubQuest(qi, sqi)
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Triggers */}
                          {subOpen && (
                            <>
                              {subQuest.triggers.map((_trigger, ti) => (
                                <TreeItem
                                  key={ti}
                                  label={`Trigger ${ti + 1}`}
                                  depth={4}
                                  selected={isSelected('trigger', qi, sqi, ti)}
                                  onClick={() => setSelection('trigger', [qi, sqi, ti])}
                                  onDelete={() => removeTrigger(qi, sqi, ti)}
                                  icon={<Layers className="h-3 w-3" />}
                                />
                              ))}
                              <div
                                className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                                style={{ paddingLeft: '64px' }}
                                onClick={() => addTrigger(qi, sqi)}
                              >
                                <Plus className="h-3 w-3" />
                                Add Trigger
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                  {/* Add SubQuest */}
                  {questOpen && (
                    <div
                      className="flex items-center gap-1 py-0.5 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                      style={{ paddingLeft: '50px' }}
                      onClick={() => addSubQuest(qi)}
                    >
                      <Plus className="h-3 w-3" />
                      Add SubQuest
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </ScrollArea>
  )
}
