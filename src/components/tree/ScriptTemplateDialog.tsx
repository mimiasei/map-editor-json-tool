// ─── Script Template wizard (issue #149) ───────────────────────────────────────
// Two-step dialog: pick a template, then fill its object-picker slots and
// numeric params. Generated content (one hidden Quest, optionally some
// Counters) is MERGED into the current project via
// useScenarioStore.appendGeneratedContent — unlike TemplatePickerDialog
// (src/components/guides/), which replaces the whole project. Deliberately
// generic over SCRIPT_TEMPLATE_LIST so future templates (beyond Hut of the
// Magi) need no changes here — only a new entry in
// src/schema/script-templates.ts.

import { useMemo, useState } from 'react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SCRIPT_TEMPLATE_LIST } from '@/schema/script-templates'
import type { ScriptTemplateDef, ScriptTemplateInput } from '@/types/script-template'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import EntityPickerList from '@/components/common/EntityPickerList'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function emptyInput(template: ScriptTemplateDef): ScriptTemplateInput {
  return {
    slots: Object.fromEntries(template.slots.map((s) => [s.id, ['']])),
    params: Object.fromEntries((template.params ?? []).map((p) => [p.id, p.defaultValue])),
  }
}

export default function ScriptTemplateDialog({ open, onOpenChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [input, setInput] = useState<ScriptTemplateInput>({ slots: {}, params: {} })

  const mapContext = useMapContextStore((s) => s.context)
  const quests = useScenarioStore((s) => s.scenario.quests)
  const counters = useScenarioStore((s) => s.scenario.counters)
  const appendGeneratedContent = useScenarioStore((s) => s.appendGeneratedContent)

  const selectedTemplate = SCRIPT_TEMPLATE_LIST.find((t) => t.id === selectedId) ?? null

  const handlePickTemplate = (template: ScriptTemplateDef) => {
    setSelectedId(template.id)
    setInput(emptyInput(template))
  }

  const handleBack = () => {
    setSelectedId(null)
    setInput({ slots: {}, params: {} })
  }

  const handleClose = (o: boolean) => {
    if (!o) handleBack()
    onOpenChange(o)
  }

  // Slot values as actually typed/picked (drop blank rows before validating —
  // a freshly-added-but-still-empty row shouldn't count as "0 picks" nor as
  // a real pick).
  const cleanedInput: ScriptTemplateInput = useMemo(
    () => ({
      slots: Object.fromEntries(
        Object.entries(input.slots).map(([k, v]) => [k, v.filter((s) => s.trim() !== '')]),
      ),
      params: input.params,
    }),
    [input],
  )

  const existingSids = useMemo(
    () => ({ quests: quests.map((q) => q.sid), counters: counters.map((c) => c.sid) }),
    [quests, counters],
  )

  const errors = useMemo(
    () => (selectedTemplate ? selectedTemplate.validate(cleanedInput, mapContext) : []),
    [selectedTemplate, cleanedInput, mapContext],
  )

  const previewResult = useMemo(() => {
    if (!selectedTemplate || !mapContext || errors.length > 0) return null
    return selectedTemplate.generate(cleanedInput, mapContext, existingSids)
  }, [selectedTemplate, mapContext, errors.length, cleanedInput, existingSids])

  const triggerCount =
    previewResult?.quest.subQuests.reduce((sum, sq) => sum + sq.triggers.length, 0) ?? 0
  const actionCount =
    previewResult?.quest.subQuests.reduce(
      (sum, sq) => sum + sq.triggers.reduce((s2, t) => s2 + t.actions.length, 0),
      0,
    ) ?? 0

  const handleGenerate = () => {
    if (!previewResult) return
    appendGeneratedContent(previewResult.quest, previewResult.counters ?? [])
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedTemplate ? selectedTemplate.name : 'Script Templates'}
          </DialogTitle>
        </DialogHeader>

        {!selectedTemplate && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Generate ready-made quest/trigger scripting from objects already on your map —
              a way to replicate classic map objects Olden Era has no native equivalent for.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCRIPT_TEMPLATE_LIST.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handlePickTemplate(t)}
                  className={cn(
                    'text-left rounded-md border p-3 space-y-1 transition-colors',
                    'border-border hover:border-primary/50 hover:bg-accent/50',
                  )}
                >
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTemplate && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>

            {!mapContext && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  Load a .map file first — object positions can't be resolved without one.
                </AlertDescription>
              </Alert>
            )}

            {selectedTemplate.slots.map((slot) => (
              <div key={slot.id} className="space-y-1.5">
                <Label>{slot.label}</Label>
                {slot.description && (
                  <p className="text-xs text-muted-foreground">{slot.description}</p>
                )}
                <EntityPickerList
                  values={input.slots[slot.id] ?? ['']}
                  onChange={(values) =>
                    setInput((s) => ({ ...s, slots: { ...s.slots, [slot.id]: values } }))
                  }
                  addLabel={`+ Add ${slot.label.toLowerCase()}`}
                  placeholder="Search placed objects…"
                />
              </div>
            ))}

            {(selectedTemplate.params ?? []).map((param) => (
              <div key={param.id} className="space-y-1.5">
                <Label htmlFor={`script-template-param-${param.id}`}>{param.label}</Label>
                <Input
                  id={`script-template-param-${param.id}`}
                  type="number"
                  min={param.min}
                  max={param.max}
                  value={input.params[param.id] ?? param.defaultValue}
                  onChange={(e) =>
                    setInput((s) => ({
                      ...s,
                      params: { ...s.params, [param.id]: Number(e.target.value) },
                    }))
                  }
                  className="w-32"
                />
              </div>
            ))}

            {errors.map((err) => (
              <Alert key={err} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">{err}</AlertDescription>
              </Alert>
            ))}

            {previewResult && (
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                This will add 1 hidden quest with {triggerCount} trigger{triggerCount === 1 ? '' : 's'}{' '}
                and {actionCount} action{actionCount === 1 ? '' : 's'} to your project.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {selectedTemplate && (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {selectedTemplate && (
            <Button onClick={handleGenerate} disabled={!previewResult}>
              Add to Project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
