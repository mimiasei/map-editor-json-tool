// ─── Story Builder wizard ──────────────────────────────────────────────────────
// Pick a premade story, stack your own beats, or describe your own idea; bind
// its slots to things on the map; choose a tone and language; review the text
// and create. The output is ordinary quests, counters and dialogs merged into
// the project in one undo step (src/lib/stories/build.ts). English is always
// the base language of the written text. Nothing is written to the project
// until "Create story". The optional text writer (desktop only) upgrades the
// built-in text in place; without it everything still works.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Dices, Loader2, Plus, Settings2, Trash2 } from '@/components/ui/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { useMapContextStore } from '@/store/useMapContextStore'
import type { MapContext } from '@/types/map-context'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { TONES, toneLabel, type Tone } from '@/lib/script-templates/text-gen/phrases'
import { beatHint, beatLabel, presetLabel, storyBlurb, storyTitle } from '@/lib/stories/story-display'
import { GAME_LANGUAGES, TRANSLATABLE_LANGUAGES, languageLabel } from '@/lib/languages'
import type { StoryDef, StoryInput, TextLength, TextSpec } from '@/types/story'
import { STORY_LIBRARY } from '@/lib/stories/library'
import { buildStory, validateStoryInput } from '@/lib/stories/build'
import { entityNameMap, suggestSlots } from '@/lib/stories/suggest'
import { draftToStoryDef } from '@/lib/stories/import'
import {
  buildCustomStory,
  CHOICE_PRESETS,
  CUSTOM_BEAT_KINDS,
  DEFAULT_AMOUNTS,
  type ChoicePreset,
  type CustomBeat,
  type CustomBeatKind,
} from '@/lib/stories/custom-story'
import { loadStoryBuilderSettings, saveStoryBuilderSettings } from '@/lib/stories/persist'
import {
  MAX_IDEA_CHARS,
  describeError,
  generateTexts,
  importStoryDraft,
  textWriterReady,
  textWriterSupported,
  translateRequest,
  type TextWriterError,
} from '@/lib/text-writer'
import SlotPicker from './SlotPicker'
import TextWriterSettingsDialog from './TextWriterSettingsDialog'
import { useStoryTexts } from './useStoryTexts'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True while a story is being set up, so the app can offer to resume it after the dialog is closed. */
  onDraftChange?: (hasDraft: boolean) => void
  /** Bumped by the app to throw the draft away. */
  discardToken?: number
}

type Step = 'pick' | 'import' | 'build' | 'bind' | 'style' | 'preview' | 'done'

const CUSTOM_ID = '__custom__'
const IMPORT_ID = '__import__'

// Labels live in en.json under story.storyBuilderDialog.{kinds,lengths,amounts}.<key>.
type AmountKind = 'resources' | 'timer' | 'reward'
const isAmountKind = (k: CustomBeatKind): k is AmountKind => k === 'resources' || k === 'timer' || k === 'reward'

function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999)
}

/** Every entity sid currently on the map. */
function mapSids(ctx: MapContext | null): Set<string> {
  const out = new Set<string>()
  if (!ctx) return out
  for (const e of ctx.entities) out.add(e.sid)
  for (const p of ctx.placedObjects) if (p.entitySid) out.add(p.entitySid)
  return out
}

export default function StoryBuilderDialog({ open, onOpenChange, onDraftChange, discardToken = 0 }: Props) {
  const { t } = useTranslation()
  const saved = useMemo(() => loadStoryBuilderSettings(), [])

  const [step, setStep] = useState<Step>('pick')
  const [storyId, setStoryId] = useState<string | null>(null)
  const [customBeats, setCustomBeats] = useState<CustomBeat[]>([{ kind: 'intro' }])
  const [importedDef, setImportedDef] = useState<StoryDef | null>(null)
  const [ideaText, setIdeaText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [tone, setTone] = useState<Tone>(saved.tone ?? 'heroic')
  const [length, setLength] = useState<TextLength>(saved.length ?? 'short')
  const [writingLang, setWritingLang] = useState<string>(saved.language ?? 'english')
  const [extraLangs, setExtraLangs] = useState<string[]>([])
  const [slots, setSlots] = useState<Record<string, string[]>>({})
  const [seed, setSeed] = useState(newSeed)
  const [creating, setCreating] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const mapContext = useMapContextStore((s) => s.context)
  const mapName = useScenarioStore((s) => s.mapName)
  const quests = useScenarioStore((s) => s.scenario.quests)
  const counters = useScenarioStore((s) => s.scenario.counters)
  const interruptions = useScenarioStore((s) => s.scenario.interruptions)
  const dialogs = useScenarioStore((s) => s.dialogs)
  const localization = useScenarioStore((s) => s.localization)
  const appendGeneratedStory = useScenarioStore((s) => s.appendGeneratedStory)
  const setDialogFlow = useScenarioStore((s) => s.setDialogFlow)
  const setLocalizationBatch = useScenarioStore((s) => s.setLocalizationBatch)
  const setTranslationBatch = useScenarioStore((s) => s.setTranslationBatch)

  const refreshReady = useCallback(async () => setReady(await textWriterReady()), [])
  useEffect(() => {
    if (open) void refreshReady()
  }, [open, refreshReady])

  // Without the text writer only English can be produced.
  const lang = ready ? writingLang : 'english'

  // Picking on the Map Grid: close this dialog (its state lives here, so it
  // survives) and reopen it once the pick is resolved or cancelled.
  const requestPick = useViewBridgeStore((s) => s.requestPick)
  const requestMapPick = (label: string, onPicked: (sid: string) => void) => {
    onOpenChange(false)
    requestPick({
      kind: 'mapEntity',
      label,
      onResolve: onPicked,
      onFinish: () => onOpenChange(true),
    })
  }

  const def: StoryDef | null = useMemo(() => {
    if (storyId === CUSTOM_ID) return buildCustomStory(customBeats, tone)
    if (storyId === IMPORT_ID) return importedDef
    return STORY_LIBRARY.find((s) => s.id === storyId) ?? null
  }, [storyId, customBeats, tone, importedDef])

  const input: StoryInput = useMemo(
    () => ({
      slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.map((s) => s.trim()).filter(Boolean)])),
      tone,
      length,
      seed,
    }),
    [slots, tone, length, seed],
  )

  const inputErrors = useMemo(() => (def ? validateStoryInput(def, input) : []), [def, input])

  const generated = useMemo(() => {
    if (!def || step !== 'preview' || inputErrors.length > 0) return null
    return buildStory(
      def,
      input,
      { mapName, entityNames: entityNameMap(mapContext) },
      {
        quests: quests.map((q) => q.sid),
        counters: counters.map((c) => c.sid),
        interruptions: interruptions.map((i) => i.sid),
        dialogs: Object.keys(dialogs),
        tokens: Object.keys(localization),
      },
    )
  }, [def, step, inputErrors.length, input, mapName, mapContext, quests, counters, interruptions, dialogs, localization])

  const texts = useStoryTexts({
    specs: generated?.textSpecs ?? null,
    defaults: generated?.localizationTokens ?? {},
    resetKey: `${storyId}|${def?.title}|${seed}|${tone}|${length}|${JSON.stringify(input.slots)}|${customBeats.length}|${generated ? 1 : 0}`,
    lang,
    ready,
  })

  const reset = () => {
    setStep('pick')
    setStoryId(null)
    setImportedDef(null)
    setIdeaText('')
    setImportError(null)
    setSlots({})
    setExtraLangs([])
    setDoneNote(null)
    setRemovedPicks([])
    setSeed(newSeed())
  }

  // Closing (X, Escape, "Hide") keeps the draft so the user can edit the map and
  // come back; only "Discard", finishing, or the app's banner throws it away.
  const handleOpenChange = (o: boolean) => {
    if (!o && step === 'done') reset()
    onOpenChange(o)
  }

  const closeAndReset = () => {
    reset()
    onOpenChange(false)
  }

  const hasDraft = step !== 'pick' && step !== 'done'
  useEffect(() => {
    onDraftChange?.(hasDraft)
  }, [hasDraft, onDraftChange])

  const firstDiscard = useRef(true)
  useEffect(() => {
    if (firstDiscard.current) {
      firstDiscard.current = false
      return
    }
    reset()
  }, [discardToken])

  // Picks that pointed at something the user has since removed from the map are
  // cleared, so they pick again instead of getting a story about a missing place.
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const knownSids = useRef<Set<string>>(new Set())
  const [removedPicks, setRemovedPicks] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    const current = mapSids(mapContext)
    const before = knownSids.current
    knownSids.current = current
    if (before.size === 0 || !mapContext) return
    const gone = new Set<string>()
    for (const values of Object.values(slotsRef.current)) {
      for (const v of values) if (v && before.has(v) && !current.has(v)) gone.add(v)
    }
    if (gone.size === 0) return
    setSlots((s) =>
      Object.fromEntries(Object.entries(s).map(([k, vals]) => [k, vals.map((v) => (gone.has(v) ? '' : v))])),
    )
    setRemovedPicks([...gone])
    setStep((cur) => (cur === 'style' || cur === 'preview' ? 'bind' : cur))
  }, [open, mapContext])

  const pickStory = (story: StoryDef) => {
    setStoryId(story.id)
    setTone(story.tone)
    setSlots(suggestSlots(story, mapContext))
    setStep('bind')
  }

  const startCustom = () => {
    setStoryId(CUSTOM_ID)
    setStep('build')
  }

  const finishBuild = () => {
    const built = buildCustomStory(customBeats, tone)
    setSlots(suggestSlots(built, mapContext))
    setStep(built.slots.length > 0 ? 'bind' : 'style')
  }

  const runImport = async () => {
    setImportBusy(true)
    setImportError(null)
    try {
      const draft = await importStoryDraft(ideaText, lang)
      const result = draftToStoryDef(draft)
      if ('error' in result) {
        setImportError(t('story.storyBuilderDialog.ideaNotStory'))
        return
      }
      setImportedDef(result.def)
      setStoryId(IMPORT_ID)
      setTone(result.def.tone)
      setSlots(suggestSlots(result.def, mapContext))
      setStep(result.def.slots.length > 0 ? 'bind' : 'style')
    } catch (e) {
      setImportError(describeError(e as TextWriterError) ?? t('story.storyBuilderDialog.writerUnavailable'))
    } finally {
      setImportBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!generated) return
    setCreating(true)
    const snap = texts.snapshot()
    const notes: string[] = []
    const extraResults: Record<string, Record<string, string>> = {}
    // Other languages are translated from the English base. A failure only skips that language.
    if (ready) {
      for (const target of extraLangs.filter((l) => l !== 'english' && l !== lang)) {
        try {
          const res = await generateTexts(
            generated.textSpecs.map((s) => translateRequest(s, 'english', target, snap.english[s.id])),
          )
          extraResults[target] = res
        } catch (e) {
          notes.push(t('story.storyBuilderDialog.languageNotWritten', { language: languageLabel(target), reason: describeError(e as TextWriterError) ?? t('story.storyBuilderDialog.notAvailable') }))
        }
      }
    }
    // Texts the user can edit come from the preview; fixed lines (sub-quest objectives) come straight from the build.
    setLocalizationBatch({ ...generated.localizationTokens, ...snap.english })
    if (texts.nonEnglish && Object.keys(snap.native).length > 0) setTranslationBatch(lang, snap.native)
    for (const [target, res] of Object.entries(extraResults)) setTranslationBatch(target, res)
    for (const flow of generated.dialogFlows) setDialogFlow(flow.id, flow)
    appendGeneratedStory({
      quests: generated.quests,
      counters: generated.counters,
      interruptions: generated.interruptions,
    })
    saveStoryBuilderSettings({ tone, length, language: writingLang })
    setCreating(false)
    if (notes.length > 0) {
      setDoneNote(notes.join(' '))
      setStep('done')
    } else {
      closeAndReset()
    }
  }

  const backStep: Record<Step, Step | null> = {
    pick: null,
    import: 'pick',
    build: 'pick',
    bind: storyId === CUSTOM_ID ? 'build' : storyId === IMPORT_ID ? 'import' : 'pick',
    style: def && def.slots.length > 0 ? 'bind' : storyId === CUSTOM_ID ? 'build' : storyId === IMPORT_ID ? 'import' : 'pick',
    preview: 'style',
    done: null,
  }

  const title: Record<Step, string> = {
    pick: t('story.storyBuilderDialog.steps.pick'),
    import: t('story.storyBuilderDialog.steps.import'),
    build: t('story.storyBuilderDialog.steps.build'),
    bind: def ? storyTitle(def) : t('story.storyBuilderDialog.steps.story'),
    style: def ? storyTitle(def) : t('story.storyBuilderDialog.steps.story'),
    preview: def ? storyTitle(def) : t('story.storyBuilderDialog.steps.story'),
    done: t('story.storyBuilderDialog.steps.done'),
  }

  const moveBeat = (i: number, dir: -1 | 1) => {
    setCustomBeats((beats) => {
      const j = i + dir
      if (j < 0 || j >= beats.length) return beats
      const next = [...beats]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const addBeat = (kind: CustomBeatKind) =>
    setCustomBeats((beats) => [
      ...beats,
      { kind, amount: DEFAULT_AMOUNTS[kind], preset: kind === 'choice' ? 'mercy' : undefined },
    ])

  const supported = textWriterSupported()

  const renderLine = (spec: TextSpec) => {
    const kindLabel = t(`story.storyBuilderDialog.kinds.${spec.kind}`)
    const label = spec.intent ? t('story.storyBuilderDialog.kindWithIntent', { kind: kindLabel, intent: spec.intent }) : kindLabel
    const indent = spec.kind === 'answer' || spec.kind === 'outcome' ? 'ml-5' : ''
    const rows = spec.kind === 'answer' ? 1 : 2
    return (
      <div key={spec.id} className={cn('space-y-1', indent)}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            disabled={texts.busy}
            onClick={() => void texts.another(spec)}
          >
            <Dices className="h-3 w-3" /> {t('story.storyBuilderDialog.another')}
          </Button>
        </div>
        {texts.nonEnglish ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">{languageLabel(lang)}</p>
              <Textarea
                rows={rows}
                className="min-h-0 text-sm"
                value={texts.native(spec.id)}
                onChange={(e) => texts.setNative(spec.id, e.target.value)}
              />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{t('story.storyBuilderDialog.english')}</p>
                {texts.stale.has(spec.id) && (
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    disabled={texts.busy}
                    onClick={() => void texts.updateEnglish(spec)}
                  >
                    {t('story.storyBuilderDialog.outOfDateUpdate')}
                  </button>
                )}
              </div>
              <Textarea
                rows={rows}
                className="min-h-0 text-sm"
                value={texts.english(spec.id)}
                onChange={(e) => texts.setEnglish(spec.id, e.target.value)}
              />
            </div>
          </div>
        ) : (
          <Textarea
            rows={rows}
            className="min-h-0 text-sm"
            value={texts.english(spec.id)}
            onChange={(e) => texts.setEnglish(spec.id, e.target.value)}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title[step]}</DialogTitle>
          </DialogHeader>

          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t('story.storyBuilderDialog.chooseAStoryItAdds')}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="story-language" className="text-xs">
                  {t('story.storyBuilderDialog.writeIn')}
                </Label>
                <select
                  id="story-language"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={lang}
                  onChange={(e) => setWritingLang(e.target.value)}
                >
                  {GAME_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id} disabled={l.id !== 'english' && !ready}>
                      {languageLabel(l.id)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {lang === 'english' ? t('story.storyBuilderDialog.english') : `${languageLabel(lang)} + English`}
                </span>
                {supported && (
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {ready ? t('story.storyBuilderDialog.textWriterIsOn') : t('story.storyBuilderDialog.setUpTheTextWriter')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STORY_LIBRARY.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickStory(s)}
                    className={cn(
                      'text-left rounded-md border p-3 space-y-1.5 transition-colors',
                      'border-border hover:border-primary/50 hover:bg-accent/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{storyTitle(s)}</p>
                      <Badge variant="secondary">{toneLabel(s.tone)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{storyBlurb(s)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(s.beats.some((b) => b.kind === 'choice') ? 'story.storyBuilderDialog.questsWithChoices' : 'story.storyBuilderDialog.questCount', { count: s.beats.length })}
                    </p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={startCustom}
                  className={cn(
                    'text-left rounded-md border border-dashed p-3 space-y-1.5 transition-colors',
                    'border-border hover:border-primary/50 hover:bg-accent/50',
                  )}
                >
                  <p className="text-sm font-medium">{t('story.storyBuilderDialog.buildMyOwn')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('story.storyBuilderDialog.stackStepsLikeVisitingPlaces')}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => setStep('import')}
                  className={cn(
                    'text-left rounded-md border border-dashed p-3 space-y-1.5 transition-colors',
                    'border-border hover:border-primary/50 hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-transparent',
                  )}
                >
                  <p className="text-sm font-medium">{t('story.storyBuilderDialog.iHaveMyOwnIdea')}</p>
                  <p className="text-xs text-muted-foreground">
                    {ready
                      ? t('story.storyBuilderDialog.describeAStoryInYour')
                      : t('story.storyBuilderDialog.needsTheTextWriterSet')}
                  </p>
                </button>
              </div>
            </div>
          )}

          {step === 'import' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('story.storyBuilderDialog.describeStory', { language: languageLabel(lang) })}
              </p>
              <Textarea
                rows={9}
                maxLength={MAX_IDEA_CHARS}
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder={t('story.storyBuilderDialog.aYoungHeirHasVanished')}
              />
              <p className="text-right text-xs text-muted-foreground">
                {ideaText.length} / {MAX_IDEA_CHARS}
              </p>
              {importError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">{importError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'build' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t('story.storyBuilderDialog.addStepsInTheOrder')}
              </p>
              <div className="space-y-2">
                {customBeats.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                    <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{beatLabel(b.kind)}</p>
                      <p className="text-xs text-muted-foreground">{beatHint(b.kind)}</p>
                    </div>
                    {isAmountKind(b.kind) && (
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs">{t(`story.storyBuilderDialog.amounts.${b.kind}`)}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={b.amount ?? DEFAULT_AMOUNTS[b.kind] ?? 1}
                          onChange={(e) =>
                            setCustomBeats((beats) =>
                              beats.map((x, idx) => (idx === i ? { ...x, amount: Math.max(1, Number(e.target.value) || 1) } : x)),
                            )
                          }
                          className="h-8 w-24"
                        />
                      </div>
                    )}
                    {b.kind === 'choice' && (
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={b.preset ?? 'mercy'}
                        onChange={(e) =>
                          setCustomBeats((beats) =>
                            beats.map((x, idx) => (idx === i ? { ...x, preset: e.target.value as ChoicePreset } : x)),
                          )
                        }
                      >
                        {CHOICE_PRESETS.map((p) => (
                          <option key={p} value={p}>
                            {presetLabel(p)}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => moveBeat(i, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={i === customBeats.length - 1}
                        onClick={() => moveBeat(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setCustomBeats((beats) => beats.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_BEAT_KINDS.map((k) => (
                  <Button key={k} type="button" variant="outline" size="sm" className="gap-1" onClick={() => addBeat(k)}>
                    <Plus className="h-3 w-3" /> {beatLabel(k)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {step === 'bind' && def && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{storyBlurb(def)}</p>
              {!mapContext && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    {t('story.storyBuilderDialog.openAMapFileFirst')}
                  </AlertDescription>
                </Alert>
              )}
              {removedPicks.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    {t('story.storyBuilderDialog.removedPicks', { count: removedPicks.length, names: removedPicks.map((s) => entityNameMap(mapContext)[s] ?? s).join(', ') })}
                  </AlertDescription>
                </Alert>
              )}
              {def.slots.map((slot) => (
                <SlotPicker
                  key={slot.id}
                  slot={slot}
                  values={slots[slot.id] ?? ['']}
                  onChange={(v) => setSlots((s) => ({ ...s, [slot.id]: v }))}
                  requestMapPick={mapContext ? requestMapPick : undefined}
                />
              ))}
              {inputErrors.map((err) => (
                <Alert key={err} variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">{err}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {step === 'style' && def && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('story.storyBuilderDialog.tone')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((tn) => (
                    <Button
                      key={tn}
                      type="button"
                      size="sm"
                      aria-pressed={tone === tn} variant={tone === tn ? 'default' : 'outline'}
                      onClick={() => setTone(tn)}
                    >
                      {toneLabel(tn)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('story.storyBuilderDialog.textLength')}</Label>
                <div className="flex gap-1.5">
                  {(['short', 'medium'] as TextLength[]).map((l) => (
                    <Button key={l} type="button" size="sm" aria-pressed={length === l} variant={length === l ? 'default' : 'outline'} onClick={() => setLength(l)}>
                      {t(`story.storyBuilderDialog.lengths.${l}`)}
                    </Button>
                  ))}
                </div>
              </div>
              {ready && (
                <div className="space-y-1.5">
                  <Label>{t('story.storyBuilderDialog.alsoWriteItIn')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {lang === 'english' ? t('story.storyBuilderDialog.alwaysIncludedEnglish') : t('story.storyBuilderDialog.alwaysIncludedBoth', { language: languageLabel(lang) })}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSLATABLE_LANGUAGES.filter((l) => l.id !== lang).map((l) => (
                      <Button
                        key={l.id}
                        type="button"
                        size="sm"
                        aria-pressed={extraLangs.includes(l.id)} variant={extraLangs.includes(l.id) ? 'default' : 'outline'}
                        onClick={() =>
                          setExtraLangs((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]))
                        }
                      >
                        {languageLabel(l.id)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {!mapName.trim() && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    {t('story.storyBuilderDialog.yourMapHasNoName')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {step === 'preview' && def && generated && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t(generated.variables.length > 0 ? 'story.storyBuilderDialog.summaryTracks' : 'story.storyBuilderDialog.summary', {
                    quests: t('story.storyBuilderDialog.questCount', { count: generated.quests.length }),
                    dialogs: t('story.storyBuilderDialog.dialogCount', { count: generated.dialogFlows.length }),
                    variables: generated.variables.map((v) => v.label).join(', '),
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  disabled={texts.busy}
                  onClick={() => setSeed(newSeed())}
                >
                  <Dices className="h-3.5 w-3.5" /> {t('story.storyBuilderDialog.rewriteAll')}
                </Button>
              </div>
              {texts.busy && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('story.storyBuilderDialog.writingDialog')}
                </p>
              )}
              {texts.note && <p className="text-xs text-muted-foreground">{texts.note}</p>}
              <p className="text-xs text-muted-foreground">
                {t('story.storyBuilderDialog.editAnyTextOrAsk')}
              </p>
              <div className="space-y-3">{generated.textSpecs.map(renderLine)}</div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-3">
              <p className="text-sm">{t('story.storyBuilderDialog.yourStoryWasAddedTo')}</p>
              {doneNote && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">{doneNote}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {backStep[step] && (
              <Button variant="ghost" onClick={() => setStep(backStep[step]!)}>
                {t('tree.scriptTemplateDialog.back')}
              </Button>
            )}
            {step !== 'done' && (
              <Button variant="ghost" onClick={closeAndReset}>
                {hasDraft ? t('story.storyBuilderDialog.discardDraft') : t('shared.cancel')}
              </Button>
            )}
            {hasDraft && !importBusy && (
              <Button variant="outline" onClick={() => onOpenChange(false)} title={t('story.storyBuilderDialog.closeThisWindowAndKeep')}>
                {t('story.storyBuilderDialog.hideToEditMap')}
              </Button>
            )}
            {step === 'import' && (
              <Button onClick={() => void runImport()} disabled={importBusy || ideaText.trim().length < 20}>
                {importBusy ? t('story.storyBuilderDialog.readingYourIdea') : t('story.storyBuilderDialog.buildMyStory')}
              </Button>
            )}
            {step === 'build' && (
              <Button onClick={finishBuild} disabled={customBeats.length === 0}>
                {t('story.storyBuilderDialog.next')}
              </Button>
            )}
            {step === 'bind' && (
              <Button onClick={() => setStep('style')} disabled={inputErrors.length > 0}>
                {t('story.storyBuilderDialog.next')}
              </Button>
            )}
            {step === 'style' && <Button onClick={() => setStep('preview')}>{t('story.storyBuilderDialog.preview')}</Button>}
            {step === 'preview' && (
              <Button onClick={() => void handleCreate()} disabled={!generated || creating || texts.busy}>
                {creating ? t('common.newMapDialog.creating') : t('story.storyBuilderDialog.createStory')}
              </Button>
            )}
            {step === 'done' && <Button onClick={closeAndReset}>{t('ui.close')}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TextWriterSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onChanged={() => void refreshReady()} />
    </>
  )
}
