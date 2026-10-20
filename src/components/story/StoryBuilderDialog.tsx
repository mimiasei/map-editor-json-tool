// ─── Story Builder wizard ──────────────────────────────────────────────────────
// Pick a premade story (or stack your own beats), bind its slots to things on
// the map, choose a tone, review the text and create. The output is ordinary
// quests, counters and dialogs merged into the project in one undo step; see
// src/lib/stories/build.ts. Nothing is written until "Create story".

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Dices, Plus, Trash2 } from 'lucide-react'
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
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { TONES, TONE_LABELS, type Tone } from '@/lib/script-templates/text-gen/phrases'
import type { StoryDef, StoryInput, TextKind, TextLength } from '@/types/story'
import { STORY_LIBRARY } from '@/lib/stories/library'
import { buildStory, validateStoryInput } from '@/lib/stories/build'
import { entityNameMap, suggestSlots } from '@/lib/stories/suggest'
import { offlineText } from '@/lib/stories/text'
import {
  buildCustomStory,
  CHOICE_PRESETS,
  CHOICE_PRESET_LABELS,
  CUSTOM_BEAT_LABELS,
  DEFAULT_AMOUNTS,
  type ChoicePreset,
  type CustomBeat,
  type CustomBeatKind,
} from '@/lib/stories/custom-story'
import { loadStoryBuilderSettings, saveStoryBuilderSettings } from '@/lib/stories/persist'
import SlotPicker from './SlotPicker'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'pick' | 'build' | 'bind' | 'style' | 'preview'

const CUSTOM_ID = '__custom__'

const KIND_LABEL: Record<TextKind, string> = {
  quest_name: 'Quest title',
  quest_desc: 'Quest description',
  intro: 'Introduction',
  clue: 'Story moment',
  choice_prompt: 'The choice',
  answer: 'Answer',
  outcome: 'What happens',
  reward: 'Reward',
  finale: 'Ending',
}

const LENGTH_LABEL: Record<TextLength, string> = { short: 'Short', medium: 'Medium' }

const AMOUNT_LABEL: Partial<Record<CustomBeatKind, string>> = {
  resources: 'Gold needed',
  timer: 'Days',
  reward: 'Gold reward',
}

function newSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999)
}

export default function StoryBuilderDialog({ open, onOpenChange }: Props) {
  const saved = useMemo(() => loadStoryBuilderSettings(), [])

  const [step, setStep] = useState<Step>('pick')
  const [storyId, setStoryId] = useState<string | null>(null)
  const [customBeats, setCustomBeats] = useState<CustomBeat[]>([{ kind: 'intro' }])
  const [tone, setTone] = useState<Tone>(saved.tone ?? 'heroic')
  const [length, setLength] = useState<TextLength>(saved.length ?? 'short')
  const [slots, setSlots] = useState<Record<string, string[]>>({})
  const [seed, setSeed] = useState(newSeed)
  const [edits, setEdits] = useState<Record<string, string>>({})

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
    return STORY_LIBRARY.find((s) => s.id === storyId) ?? null
  }, [storyId, customBeats, tone])

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

  // New text (re-roll, tone or slot change) discards manual edits to the old text.
  useEffect(() => {
    setEdits({})
  }, [seed, tone, length, slots, storyId, customBeats])

  const reset = () => {
    setStep('pick')
    setStoryId(null)
    setSlots({})
    setEdits({})
    setSeed(newSeed())
  }

  // Hiding for a map pick calls onOpenChange directly (see requestMapPick) and
  // keeps state; only a real close through the dialog itself resets it.
  const handleOpenChange = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const closeAndReset = () => {
    reset()
    onOpenChange(false)
  }

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

  const textOf = (token: string) => edits[token] ?? generated?.localizationTokens[token] ?? ''

  const handleCreate = () => {
    if (!generated) return
    const tokens = { ...generated.localizationTokens, ...edits }
    setLocalizationBatch(tokens)
    for (const flow of generated.dialogFlows) setDialogFlow(flow.id, flow)
    appendGeneratedStory({
      quests: generated.quests,
      counters: generated.counters,
      interruptions: generated.interruptions,
    })
    saveStoryBuilderSettings({ tone, length })
    closeAndReset()
  }

  const backStep: Record<Step, Step | null> = {
    pick: null,
    build: 'pick',
    bind: storyId === CUSTOM_ID ? 'build' : 'pick',
    style: def && def.slots.length > 0 ? 'bind' : storyId === CUSTOM_ID ? 'build' : 'pick',
    preview: 'style',
  }

  const title: Record<Step, string> = {
    pick: 'Story Builder',
    build: 'Build your own story',
    bind: def?.title ?? 'Story',
    style: def?.title ?? 'Story',
    preview: def?.title ?? 'Story',
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title[step]}</DialogTitle>
        </DialogHeader>

        {step === 'pick' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Choose a story. It adds connected quests and dialogs to your map, with choices the player
              makes along the way. You only point at places on your map; the text is written for you.
            </p>
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
                    <p className="text-sm font-medium">{s.title}</p>
                    <Badge variant="secondary">{TONE_LABELS[s.tone]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.blurb}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.beats.length} quests
                    {s.beats.some((b) => b.kind === 'choice') ? ' · player choices' : ''}
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
                <p className="text-sm font-medium">Build my own</p>
                <p className="text-xs text-muted-foreground">
                  Stack steps like visiting places, capturing a town and making a choice.
                </p>
              </button>
            </div>
          </div>
        )}

        {step === 'build' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Add steps in the order they should happen. An ending is added for you.
            </p>
            <div className="space-y-2">
              {customBeats.map((b, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{CUSTOM_BEAT_LABELS[b.kind].label}</p>
                    <p className="text-xs text-muted-foreground">{CUSTOM_BEAT_LABELS[b.kind].hint}</p>
                  </div>
                  {AMOUNT_LABEL[b.kind] && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">{AMOUNT_LABEL[b.kind]}</Label>
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
                          {CHOICE_PRESET_LABELS[p]}
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
              {(Object.keys(CUSTOM_BEAT_LABELS) as CustomBeatKind[]).map((k) => (
                <Button key={k} type="button" variant="outline" size="sm" className="gap-1" onClick={() => addBeat(k)}>
                  <Plus className="h-3 w-3" /> {CUSTOM_BEAT_LABELS[k].label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {step === 'bind' && def && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{def.blurb}</p>
            {!mapContext && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  Open a .map file first so places on your map can be picked. You can also type object names.
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
              <Label>Tone</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={tone === t ? 'default' : 'outline'}
                    onClick={() => setTone(t)}
                  >
                    {TONE_LABELS[t]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Text length</Label>
              <div className="flex gap-1.5">
                {(['short', 'medium'] as TextLength[]).map((l) => (
                  <Button key={l} type="button" size="sm" variant={length === l ? 'default' : 'outline'} onClick={() => setLength(l)}>
                    {LENGTH_LABEL[l]}
                  </Button>
                ))}
              </div>
            </div>
            {!mapName.trim() && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  Your map has no name yet. Set one in Map Settings so the story&apos;s ids are unique to your map.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'preview' && def && generated && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {generated.quests.length} quests · {generated.dialogFlows.length} dialogs
                {generated.variables.length > 0 &&
                  ` · tracks: ${generated.variables.map((v) => v.label).join(', ')}`}
              </p>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setSeed(newSeed())}>
                <Dices className="h-3.5 w-3.5" /> Rewrite all
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit any text, or roll a new version of one line. Nothing is added until you press Create story.
            </p>
            <div className="space-y-3">
              {generated.textSpecs.map((spec) => (
                <div key={spec.id} className={cn('space-y-1', spec.kind === 'answer' || spec.kind === 'outcome' ? 'ml-5' : '')}>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs text-muted-foreground">
                      {KIND_LABEL[spec.kind]}
                      {spec.intent ? ` · ${spec.intent}` : ''}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-xs"
                      onClick={() =>
                        setEdits((e) => ({ ...e, [spec.id]: offlineText(spec, Math.random) }))
                      }
                    >
                      <Dices className="h-3 w-3" /> Another
                    </Button>
                  </div>
                  <Textarea
                    rows={spec.kind === 'answer' ? 1 : 2}
                    className="min-h-0 text-sm"
                    value={textOf(spec.id)}
                    onChange={(e) => setEdits((ed) => ({ ...ed, [spec.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {backStep[step] && (
            <Button variant="ghost" onClick={() => setStep(backStep[step]!)}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={closeAndReset}>
            Cancel
          </Button>
          {step === 'build' && (
            <Button onClick={finishBuild} disabled={customBeats.length === 0}>
              Next
            </Button>
          )}
          {step === 'bind' && (
            <Button onClick={() => setStep('style')} disabled={inputErrors.length > 0}>
              Next
            </Button>
          )}
          {step === 'style' && <Button onClick={() => setStep('preview')}>Preview</Button>}
          {step === 'preview' && (
            <Button onClick={handleCreate} disabled={!generated}>
              Create story
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
