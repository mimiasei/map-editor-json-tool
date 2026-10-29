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
import { AlertTriangle } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { SCRIPT_TEMPLATE_LIST } from '@/schema/script-templates'
import type { ScriptTemplateDef, ScriptTemplateInput } from '@/types/script-template'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import EntityPickerList from '@/components/common/EntityPickerList'
import { useTranslation } from 'react-i18next'
import { templateName, templateDescription, templateSlotLabel, templateSlotDescription, templateParamLabel, templateParamPlaceholder } from '@/lib/script-templates/template-display'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function emptyInput(template: ScriptTemplateDef): ScriptTemplateInput {
  return {
    slots: Object.fromEntries(template.slots.map((s) => [s.id, ['']])),
    params: Object.fromEntries((template.params ?? []).map((p) => [p.id, p.defaultValue])),
    fields: {},
  }
}

export default function ScriptTemplateDialog({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [input, setInput] = useState<ScriptTemplateInput>({ slots: {}, params: {}, fields: {} })

  const mapContext = useMapContextStore((s) => s.context)
  const quests = useScenarioStore((s) => s.scenario.quests)
  const counters = useScenarioStore((s) => s.scenario.counters)
  const dialogs = useScenarioStore((s) => s.dialogs)
  const appendGeneratedContent = useScenarioStore((s) => s.appendGeneratedContent)
  const setDialogFlow = useScenarioStore((s) => s.setDialogFlow)
  const setLocalizationBatch = useScenarioStore((s) => s.setLocalizationBatch)

  const selectedTemplate = SCRIPT_TEMPLATE_LIST.find((tpl) => tpl.id === selectedId) ?? null

  // Picking on the Map Grid: hide this dialog (its state lives here, so it
  // survives being closed — onOpenChange, not handleClose, which resets it),
  // then reopen it once the pick is resolved or cancelled.
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

  const handlePickTemplate = (template: ScriptTemplateDef) => {
    setSelectedId(template.id)
    setInput(emptyInput(template))
  }

  const handleBack = () => {
    setSelectedId(null)
    setInput({ slots: {}, params: {}, fields: {} })
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
      fields: input.fields,
    }),
    [input],
  )

  const existingSids = useMemo(
    () => ({
      quests: quests.map((q) => q.sid),
      counters: counters.map((c) => c.sid),
      dialogs: Object.keys(dialogs),
    }),
    [quests, counters, dialogs],
  )

  const errors = useMemo(
    () => (selectedTemplate ? selectedTemplate.validate(cleanedInput, mapContext, existingSids) : []),
    // i18n.language: the messages are translated when they are made
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTemplate, cleanedInput, mapContext, existingSids, i18n.language],
  )

  const previewResult = useMemo(() => {
    if (!selectedTemplate || errors.length > 0) return null
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
    if (previewResult.localizationTokens && Object.keys(previewResult.localizationTokens).length > 0) {
      setLocalizationBatch(previewResult.localizationTokens)
    }
    if (previewResult.dialogFlow) {
      setDialogFlow(previewResult.dialogFlow.id, previewResult.dialogFlow)
    }
    for (const flow of previewResult.dialogFlows ?? []) setDialogFlow(flow.id, flow)
    appendGeneratedContent(previewResult.quest, previewResult.counters ?? [])
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedTemplate ? templateName(selectedTemplate) : t('tree.scriptTemplateDialog.scriptTemplates')}
          </DialogTitle>
        </DialogHeader>

        {!selectedTemplate && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t('tree.scriptTemplateDialog.intro')}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SCRIPT_TEMPLATE_LIST.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handlePickTemplate(tpl)}
                  className={cn(
                    'text-left rounded-md border p-3 space-y-1 transition-colors',
                    'border-border hover:border-primary/50 hover:bg-accent/50',
                  )}
                >
                  <p className="text-sm font-medium">{templateName(tpl)}</p>
                  <p className="text-xs text-muted-foreground">{templateDescription(tpl)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTemplate && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{templateDescription(selectedTemplate)}</p>

            {selectedTemplate.renderFields ? (
              selectedTemplate.renderFields({
                input,
                setInput,
                mapContext,
                requestMapPick: mapContext ? requestMapPick : undefined,
              })
            ) : (
              <>
                {selectedTemplate.slots.map((slot) => (
                  <div key={slot.id} className="space-y-1.5">
                    <Label>{templateSlotLabel(selectedTemplate, slot)}</Label>
                    {slot.description && (
                      <p className="text-xs text-muted-foreground">{templateSlotDescription(selectedTemplate, slot)}</p>
                    )}
                    <EntityPickerList
                      values={input.slots[slot.id] ?? ['']}
                      onChange={(values) =>
                        setInput((s) => ({ ...s, slots: { ...s.slots, [slot.id]: values } }))
                      }
                      addLabel={t('tree.scriptTemplateDialog.addSlot', { what: templateSlotLabel(selectedTemplate, slot).toLowerCase() })}
                      placeholder={t('tree.scriptTemplateDialog.searchPlacedObjects')}
                    />
                  </div>
                ))}

                {(selectedTemplate.params ?? []).map((param) => (
                  <div key={param.id} className="space-y-1.5">
                    <Label htmlFor={`script-template-param-${param.id}`}>{templateParamLabel(selectedTemplate, param)}</Label>
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

                {(selectedTemplate.stringParams ?? []).map((param) => (
                  <div key={param.id} className="space-y-1.5">
                    <Label htmlFor={`script-template-field-${param.id}`}>{templateParamLabel(selectedTemplate, param)}</Label>
                    <Input
                      id={`script-template-field-${param.id}`}
                      value={input.fields[param.id] ?? ''}
                      placeholder={templateParamPlaceholder(selectedTemplate, param)}
                      onChange={(e) =>
                        setInput((s) => ({
                          ...s,
                          fields: { ...s.fields, [param.id]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </>
            )}

            {errors.map((err) => (
              <Alert key={err} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">{err}</AlertDescription>
              </Alert>
            ))}

            {previewResult && (
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                {t(previewResult.quest.hidden ? 'tree.scriptTemplateDialog.addSummaryHidden' : 'tree.scriptTemplateDialog.addSummary', {
                  triggers: t('tree.scriptTemplateDialog.triggerCount', { count: triggerCount }),
                  actions: t('tree.scriptTemplateDialog.actionCount', { count: actionCount }),
                })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {selectedTemplate && (
            <Button variant="ghost" onClick={handleBack}>
              {t('tree.scriptTemplateDialog.back')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => handleClose(false)}>
            {t('shared.cancel')}
          </Button>
          {selectedTemplate && (
            <Button onClick={handleGenerate} disabled={!previewResult}>
              {t('tree.scriptTemplateDialog.addToProject')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
