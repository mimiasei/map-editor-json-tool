import { useState, useMemo } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { DialogFlow } from '@/types/dialog'
import type { Quest } from '@/types/scenario'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Upload } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Collect all SIDs referenced in dialogs */
function collectDialogSids(dialogs: Record<string, DialogFlow>): Set<string> {
  const sids = new Set<string>()
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      if (slide.text) sids.add(slide.text)
      if (slide.answers) {
        for (const answer of slide.answers) {
          if (answer.text) sids.add(answer.text)
        }
      }
    }
  }
  return sids
}

/** Collect all quest/subquest name SIDs from scenario */
function collectQuestNameSids(quests: Quest[]): Set<string> {
  const sids = new Set<string>()
  for (const quest of quests) {
    if (quest.name) sids.add(quest.name)
    for (const sq of quest.subQuests) {
      if (sq.name) sids.add(sq.name)
    }
  }
  return sids
}

// ─── Token row ───────────────────────────────────────────────────────────────────

function TokenRow({
  sid,
  text,
  onChange,
}: {
  sid: string
  text: string
  onChange: (text: string) => void
}) {
  const missing = !text.trim()

  return (
    <div className="space-y-1 rounded border border-border p-2 bg-card">
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono text-muted-foreground flex-1 truncate">{sid}</code>
        {missing && (
          <Badge variant="secondary" className="text-amber-500 text-xs shrink-0">
            missing
          </Badge>
        )}
      </div>
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter English text…"
        className={`min-h-[52px] text-sm resize-y ${missing ? 'border-amber-600/50' : ''}`}
        rows={2}
      />
    </div>
  )
}

// ─── Tab ─────────────────────────────────────────────────────────────────────────

type Tab = 'dialogs' | 'quests' | 'all'

// ─── Main ────────────────────────────────────────────────────────────────────────

export default function LocalizationDialog() {
  const {
    localizationDialogOpen,
    setLocalizationDialogOpen,
    localization,
    dialogs,
    scenario,
    setLocalizationToken,
    setLocalizationBatch,
  } = useScenarioStore()

  const [tab, setTab] = useState<Tab>('dialogs')
  const [search, setSearch] = useState('')

  const dialogSids = useMemo(() => collectDialogSids(dialogs), [dialogs])
  const questSids = useMemo(() => collectQuestNameSids(scenario.quests), [scenario.quests])

  // All known SIDs (union of dialog + quest + existing localization keys)
  const allSids = useMemo(() => {
    const s = new Set<string>([...dialogSids, ...questSids, ...Object.keys(localization)])
    return Array.from(s).sort()
  }, [dialogSids, questSids, localization])

  const tabSids: string[] =
    tab === 'dialogs'
      ? Array.from(dialogSids).sort()
      : tab === 'quests'
      ? Array.from(questSids).sort()
      : allSids

  const filteredSids = search
    ? tabSids.filter(
        (sid) =>
          sid.toLowerCase().includes(search.toLowerCase()) ||
          (localization[sid] ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : tabSids

  const missingCount = tabSids.filter((sid) => !localization[sid]?.trim()).length

  // ── Import from JSON paste ────────────────────────────────────────────────────
  const handleImportPaste = () => {
    const raw = window.prompt(
      'Paste the contents of a customMaps.json file ({"tokens":[{"sid":"...","text":"..."},...]}):',
    )
    if (!raw) return
    try {
      const obj = JSON.parse(raw.replace(/^\uFEFF/, '')) // strip BOM
      if (!obj?.tokens || !Array.isArray(obj.tokens)) {
        alert('Unexpected format. Expected {"tokens": [...]}')
        return
      }
      const batch: Record<string, string> = {}
      for (const token of obj.tokens) {
        if (typeof token.sid === 'string' && typeof token.text === 'string') {
          batch[token.sid] = token.text
        }
      }
      setLocalizationBatch(batch)
    } catch {
      alert('Invalid JSON.')
    }
  }

  function TabButton({ value, label }: { value: Tab; label: string }) {
    return (
      <button
        onClick={() => setTab(value)}
        className={`px-3 py-1.5 text-sm rounded ${
          tab === value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <Dialog open={localizationDialogOpen} onOpenChange={setLocalizationDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Localization — English</DialogTitle>
            {missingCount > 0 && (
              <Badge variant="secondary" className="text-amber-500">
                {missingCount} missing
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 ml-auto"
              onClick={handleImportPaste}
            >
              <Upload className="h-3.5 w-3.5" />
              Import JSON
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <TabButton value="dialogs" label="Dialogs" />
            <TabButton value="quests" label="Quest names" />
            <TabButton value="all" label="All tokens" />
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SIDs or text…"
              className="pl-7 h-8 text-sm"
            />
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-2">
            {filteredSids.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {tab === 'dialogs' && 'No dialog SIDs found. Add slides to your dialog flows first.'}
                {tab === 'quests' && 'No quest name SIDs found. Set "name" on quests or subquests.'}
                {tab === 'all' && 'No tokens yet.'}
              </p>
            )}
            {filteredSids.map((sid) => (
              <TokenRow
                key={sid}
                sid={sid}
                text={localization[sid] ?? ''}
                onChange={(text) => setLocalizationToken(sid, text)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t border-border flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {filteredSids.length} token{filteredSids.length !== 1 ? 's' : ''} shown
          </Label>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocalizationDialogOpen(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
