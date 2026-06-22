import { useState, useCallback } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { DialogFlow, DialogSlide, DialogAnswer } from '@/types/dialog'
import type { Action } from '@/types/scenario'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import ActionList from '@/components/actions/ActionList'
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────────

function nextSlideId(slides: DialogSlide[]): string {
  if (slides.length === 0) return 'start'
  const nums = slides
    .map((s) => (s.id === 'start' ? 0 : parseInt(s.id, 10)))
    .filter((n) => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return String(max + 1)
}

function defaultTextSid(dialogId: string, slideIndex: number): string {
  return `${dialogId}_text_${slideIndex + 1}`
}

function defaultAnswerTextSid(dialogId: string, slideIndex: number, answerIndex: number): string {
  return `${dialogId}_text_${slideIndex + 1}_answer_${answerIndex + 1}`
}

// ─── Answer editor ───────────────────────────────────────────────────────────────

function AnswerEditor({
  answer,
  answerIndex,
  slideIndex,
  dialogId,
  localization,
  onChange,
  onRemove,
}: {
  answer: DialogAnswer
  answerIndex: number
  slideIndex: number
  dialogId: string
  localization: Record<string, string>
  onChange: (answer: DialogAnswer) => void
  onRemove: () => void
}) {
  const locText = answer.text ? localization[answer.text] : undefined

  return (
    <div className="rounded border border-border bg-background p-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Answer {answerIndex + 1}</span>
        <div className="flex-1 space-y-1">
          <Input
            value={answer.text}
            onChange={(e) => onChange({ ...answer, text: e.target.value })}
            placeholder={defaultAnswerTextSid(dialogId, slideIndex, answerIndex)}
            className="h-7 text-xs font-mono"
          />
          {locText && (
            <p className="text-xs text-muted-foreground italic truncate">{locText}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Dialog flow actions for this answer */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Flow actions</Label>
        <ActionList
          actions={answer.actions}
          onAdd={() =>
            onChange({ ...answer, actions: [...answer.actions, { a: 'Go', p: [''] }] })
          }
          onUpdate={(i, action) => {
            const actions = [...answer.actions]
            actions[i] = action
            onChange({ ...answer, actions })
          }}
          onRemove={(i) =>
            onChange({ ...answer, actions: answer.actions.filter((_, j) => j !== i) })
          }
        />
      </div>
    </div>
  )
}

// ─── Slide editor ────────────────────────────────────────────────────────────────

function SlideEditor({
  slide,
  slideIndex,
  dialogId,
  localization,
  allSlideIds,
  onChange,
  onRemove,
}: {
  slide: DialogSlide
  slideIndex: number
  dialogId: string
  localization: Record<string, string>
  allSlideIds: string[]
  onChange: (slide: DialogSlide) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(slideIndex === 0)
  const locText = slide.text ? localization[slide.text] : undefined
  const hasIssues = slide.text && !localization[slide.text]

  const flowMode: 'next' | 'end' | 'answers' =
    Array.isArray(slide.answers) && slide.answers.length > 0
      ? 'answers'
      : slide.end
      ? 'end'
      : 'next'

  const addAnswer = () => {
    const answers = slide.answers ?? []
    const newAnswer: DialogAnswer = {
      text: defaultAnswerTextSid(dialogId, slideIndex, answers.length),
      actions: [{ a: 'End' }],
      mapActions: [],
    }
    onChange({ ...slide, answers: [...answers, newAnswer], end: undefined, next: undefined })
  }

  const updateAnswer = (i: number, answer: DialogAnswer) => {
    const answers = [...(slide.answers ?? [])]
    answers[i] = answer
    onChange({ ...slide, answers })
  }

  const removeAnswer = (i: number) => {
    onChange({ ...slide, answers: (slide.answers ?? []).filter((_, j) => j !== i) })
  }

  const updateMapAction = (i: number, action: Action) => {
    const mapActions = [...(slide.mapActions ?? [])]
    mapActions[i] = action
    onChange({ ...slide, mapActions })
  }

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-mono text-xs font-semibold text-primary">{slide.id || '(no id)'}</span>
        {slide.text && (
          <span className="text-xs text-muted-foreground truncate flex-1">
            {locText ? locText : <span className="text-amber-500">missing: {slide.text}</span>}
          </span>
        )}
        {hasIssues && <Badge variant="secondary" className="text-amber-500 text-xs">!</Badge>}
        {flowMode === 'end' && <Badge variant="secondary" className="text-xs">END</Badge>}
        {flowMode === 'answers' && (
          <Badge variant="secondary" className="text-xs">{slide.answers?.length ?? 0} choices</Badge>
        )}
        {flowMode === 'next' && slide.next && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <ArrowRight className="h-3 w-3" /> {slide.next}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Slide ID + Text SID */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Slide ID</Label>
              <Input
                value={slide.id}
                onChange={(e) => onChange({ ...slide, id: e.target.value })}
                className="h-7 text-xs font-mono"
                placeholder="start"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Text SID</Label>
              <Input
                value={slide.text ?? ''}
                onChange={(e) => onChange({ ...slide, text: e.target.value || undefined })}
                className="h-7 text-xs font-mono"
                placeholder={defaultTextSid(dialogId, slideIndex)}
              />
            </div>
          </div>

          {/* Loc preview */}
          {locText && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
              {locText}
            </p>
          )}

          {/* Title / Speaker */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Speaker SID (title.sid)</Label>
              <Input
                value={slide.title?.sid ?? ''}
                onChange={(e) =>
                  onChange({
                    ...slide,
                    title: e.target.value
                      ? { ...(slide.title ?? {}), sid: e.target.value }
                      : undefined,
                  })
                }
                className="h-7 text-xs font-mono"
                placeholder="dialogue_title_hero_dungeon"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Speaker position</Label>
              <Input
                type="number"
                value={slide.title?.position ?? ''}
                onChange={(e) => {
                  const pos = e.target.value ? parseInt(e.target.value) : undefined
                  onChange({
                    ...slide,
                    title: slide.title ? { ...slide.title, position: pos } : undefined,
                  })
                }}
                className="h-7 text-xs"
                placeholder="3"
              />
            </div>
          </div>

          {/* Flow mode */}
          <div className="space-y-2">
            <Label className="text-xs">Flow</Label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={flowMode === 'next'}
                  onChange={() => onChange({ ...slide, end: undefined, answers: undefined })}
                  className="accent-primary"
                />
                Next slide
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={flowMode === 'end'}
                  onChange={() =>
                    onChange({ ...slide, end: true, next: undefined, answers: undefined })
                  }
                  className="accent-primary"
                />
                End dialog
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={flowMode === 'answers'}
                  onChange={addAnswer}
                  className="accent-primary"
                />
                Player choices
              </label>
            </div>

            {flowMode === 'next' && (
              <div className="space-y-1">
                <Label className="text-xs">Next slide ID</Label>
                <Input
                  value={slide.next ?? ''}
                  onChange={(e) => onChange({ ...slide, next: e.target.value || undefined })}
                  className="h-7 text-xs font-mono"
                  placeholder={allSlideIds.find((id) => id !== slide.id) ?? ''}
                  list={`slides-${slide.id}`}
                />
                <datalist id={`slides-${slide.id}`}>
                  {allSlideIds
                    .filter((id) => id !== slide.id)
                    .map((id) => (
                      <option key={id} value={id} />
                    ))}
                </datalist>
              </div>
            )}
          </div>

          {/* Answers */}
          {flowMode === 'answers' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Player choices</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addAnswer}>
                  <Plus className="h-3 w-3" /> Add choice
                </Button>
              </div>
              {(slide.answers ?? []).map((answer, ai) => (
                <AnswerEditor
                  key={ai}
                  answer={answer}
                  answerIndex={ai}
                  slideIndex={slideIndex}
                  dialogId={dialogId}
                  localization={localization}
                  onChange={(a) => updateAnswer(ai, a)}
                  onRemove={() => removeAnswer(ai)}
                />
              ))}
            </div>
          )}

          {/* Map actions */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Map actions (this slide)</Label>
            <ActionList
              actions={slide.mapActions ?? []}
              onAdd={() => onChange({ ...slide, mapActions: [...(slide.mapActions ?? []), { a: 'Dialog', p: [''] }] })}
              onUpdate={(i, action) => updateMapAction(i, action)}
              onRemove={(i) => onChange({ ...slide, mapActions: (slide.mapActions ?? []).filter((_, j) => j !== i) })}
            />
          </div>

          {/* invokeOnlyActions */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`invoke-only-${slide.id}`}
              checked={slide.invokeOnlyActions ?? false}
              onCheckedChange={(v) =>
                onChange({ ...slide, invokeOnlyActions: !!v || undefined })
              }
            />
            <Label htmlFor={`invoke-only-${slide.id}`} className="text-xs">
              Invoke only actions (silent slide — no dialog UI shown)
            </Label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main DialogEditor ───────────────────────────────────────────────────────────

export default function DialogEditor() {
  const {
    dialogEditorOpenId,
    dialogs,
    localization,
    closeDialogEditor,
    setDialogFlow,
    removeDialogFlow,
  } = useScenarioStore()

  const id = dialogEditorOpenId
  const flow: DialogFlow | null = id ? (dialogs[id] ?? null) : null

  // Auto-create if opened for an ID that doesn't exist yet
  if (id && !flow) {
    setDialogFlow(id, { id, localization: true, slides: [] })
  }

  const currentFlow = flow ?? { id: id ?? '', localization: true as const, slides: [] }

  const updateFlow = useCallback(
    (patch: Partial<DialogFlow>) => {
      if (!id) return
      setDialogFlow(id, { ...currentFlow, ...patch })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, currentFlow],
  )

  const addSlide = () => {
    const newId = nextSlideId(currentFlow.slides)
    const newSlide: DialogSlide = {
      id: newId,
      text: defaultTextSid(currentFlow.id, currentFlow.slides.length),
      end: true,
    }
    updateFlow({ slides: [...currentFlow.slides, newSlide] })
  }

  const updateSlide = (i: number, slide: DialogSlide) => {
    const slides = [...currentFlow.slides]
    slides[i] = slide
    updateFlow({ slides })
  }

  const removeSlide = (i: number) => {
    updateFlow({ slides: currentFlow.slides.filter((_, j) => j !== i) })
  }

  const allSlideIds = currentFlow.slides.map((s) => s.id)

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && closeDialogEditor()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Dialog ID</Label>
              <Input
                value={currentFlow.id}
                onChange={(e) => {
                  const newId = e.target.value
                  if (id && newId && newId !== id) {
                    // Rename: remove old, add new
                    removeDialogFlow(id)
                    setDialogFlow(newId, { ...currentFlow, id: newId })
                    // The modal is keyed on dialogEditorOpenId, so we re-open with new id
                    useScenarioStore.getState().openDialogEditor(newId)
                  }
                }}
                className="font-mono h-8"
                placeholder="my_map_intro"
              />
            </div>
            <DialogTitle className="sr-only">Dialog Editor</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            File: <code>DB/dialogs/dialogs/custom_maps/&lt;map&gt;/{currentFlow.id}.json</code>
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-3">
            {currentFlow.slides.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No slides yet. Add one to start building the dialog.
              </p>
            )}
            {currentFlow.slides.map((slide, i) => (
              <SlideEditor
                key={i}
                slide={slide}
                slideIndex={i}
                dialogId={currentFlow.id}
                localization={localization}
                allSlideIds={allSlideIds}
                onChange={(s) => updateSlide(i, s)}
                onRemove={() => removeSlide(i)}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t border-border">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addSlide}>
            <Plus className="h-3.5 w-3.5" /> Add Slide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
