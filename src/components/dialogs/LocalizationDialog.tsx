import { useState, useMemo, useEffect } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { DialogFlow } from '@/types/dialog'
import type { Quest } from '@/types/scenario'
import {
  BASE_LANGUAGE,
  TRANSLATABLE_LANGUAGES,
  languageLabel,
} from '@/lib/languages'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Upload, Plus, X, Languages } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Collect all SIDs referenced in dialogs, including speaker labels */
function collectDialogSids(dialogs: Record<string, DialogFlow>): Set<string> {
  const sids = new Set<string>()
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      if (slide.text) sids.add(slide.text)
      // Speaker label above the dialog text — editable, and previously not listed
      // here at all, so there was no way to give it text from this panel.
      if (slide.title?.sid) sids.add(slide.title.sid)
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
  sourceText,
  onChange,
}: {
  sid: string
  text: string
  /** English text, shown as the translation source. Undefined on the English tab. */
  sourceText?: string
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
      {sourceText !== undefined && (
        <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
          {sourceText || <span className="text-amber-500">no English text yet</span>}
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={sourceText !== undefined ? 'Enter translation…' : 'Enter English text…'}
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
    localizationFocusSid,
    clearLocalizationFocus,
    localization,
    translations,
    activeLanguages,
    dialogs,
    scenario,
    setLocalizationToken,
    setLocalizationBatch,
    setTranslationToken,
    setTranslationBatch,
    addLanguage,
    removeLanguage,
  } = useScenarioStore()

  const [tab, setTab] = useState<Tab>('dialogs')
  const [search, setSearch] = useState('')
  const [lang, setLang] = useState<string>(BASE_LANGUAGE)

  // Opened via openLocalizationFor() (e.g. clicking a slide's text in the Dialog Editor) —
  // land on the token directly instead of requiring a manual search. "All tokens" is used
  // rather than "Dialogs" so this also works for quest name/desc SIDs. Cleared immediately
  // so a later manual open of this same dialog isn't still filtered to one token.
  useEffect(() => {
    if (!localizationDialogOpen || !localizationFocusSid) return
    setTab('all')
    setSearch(localizationFocusSid)
    clearLocalizationFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localizationDialogOpen, localizationFocusSid])

  // A language removed elsewhere must not leave us on a dead tab
  const activeLang = lang !== BASE_LANGUAGE && !activeLanguages.includes(lang) ? BASE_LANGUAGE : lang
  const isBase = activeLang === BASE_LANGUAGE

  /** Token map for the language being edited. */
  const currentTokens: Record<string, string> = isBase
    ? localization
    : (translations[activeLang] ?? {})

  const setToken = (sid: string, text: string) =>
    isBase ? setLocalizationToken(sid, text) : setTranslationToken(activeLang, sid, text)

  const dialogSids = useMemo(() => collectDialogSids(dialogs), [dialogs])
  const questSids = useMemo(() => collectQuestNameSids(scenario.quests), [scenario.quests])

  // All known SIDs (union of dialog + quest + existing English keys). The English
  // map defines the token set — translations never introduce new SIDs.
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
          (currentTokens[sid] ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : tabSids

  const missingCount = tabSids.filter((sid) => !currentTokens[sid]?.trim()).length

  const availableLanguages = TRANSLATABLE_LANGUAGES.filter((l) => !activeLanguages.includes(l.id))

  // ── Import from JSON paste ────────────────────────────────────────────────────
  const handleImportPaste = () => {
    const raw = window.prompt(
      `Paste the contents of a customMaps.json file for ${languageLabel(activeLang)} ({"tokens":[{"sid":"...","text":"..."},...]}):`,
    )
    if (!raw) return
    try {
      const obj = JSON.parse(raw.replace(/^﻿/, '')) // strip BOM
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
      if (isBase) setLocalizationBatch(batch)
      else setTranslationBatch(activeLang, batch)
    } catch {
      alert('Invalid JSON.')
    }
  }

  const handleRemoveLanguage = () => {
    if (isBase) return
    const count = Object.values(translations[activeLang] ?? {}).filter((t) => t.trim()).length
    if (
      count > 0 &&
      !window.confirm(
        `Remove ${languageLabel(activeLang)} and discard its ${count} translated token${count !== 1 ? 's' : ''}?`,
      )
    ) {
      return
    }
    removeLanguage(activeLang)
    setLang(BASE_LANGUAGE)
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

  /** Count of untranslated tokens for a language, used on the language chips. */
  function missingFor(langId: string): number {
    const tokens = langId === BASE_LANGUAGE ? localization : (translations[langId] ?? {})
    return allSids.filter((sid) => !tokens[sid]?.trim()).length
  }

  function LangChip({ langId }: { langId: string }) {
    const active = activeLang === langId
    const missing = missingFor(langId)
    return (
      <button
        onClick={() => setLang(langId)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        }`}
      >
        {languageLabel(langId)}
        {missing > 0 && (
          <span className={active ? 'opacity-80' : 'text-amber-500'}>{missing}</span>
        )}
      </button>
    )
  }

  return (
    <Dialog open={localizationDialogOpen} onOpenChange={setLocalizationDialogOpen}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={720}
        defaultHeight={700}
        minWidth={480}
        minHeight={400}
        storageKey="localization"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header — the drag handle. pr-10 clears the close button. */}
        <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Localization — {languageLabel(activeLang)}</DialogTitle>
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

          {/* ── Language bar ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            <Languages className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            <LangChip langId={BASE_LANGUAGE} />
            {activeLanguages.map((l) => (
              <LangChip key={l} langId={l} />
            ))}
            {availableLanguages.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                    <Plus className="h-3 w-3" /> Add language
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  {availableLanguages.map((l) => (
                    <DropdownMenuItem
                      key={l.id}
                      onSelect={() => {
                        addLanguage(l.id)
                        setLang(l.id)
                      }}
                      className="text-xs"
                    >
                      {l.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isBase && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleRemoveLanguage}
              >
                <X className="h-3 w-3" /> Remove
              </Button>
            )}
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
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 space-y-2">
            {!isBase && (
              <p className="rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                Untranslated tokens ship with the English text as a fallback.
              </p>
            )}
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
                text={currentTokens[sid] ?? ''}
                sourceText={isBase ? undefined : (localization[sid] ?? '')}
                onChange={(text) => setToken(sid, text)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t border-border flex items-center gap-2 shrink-0">
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
      </DraggableDialogContent>
    </Dialog>
  )
}
