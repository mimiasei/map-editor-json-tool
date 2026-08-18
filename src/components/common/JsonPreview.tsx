import { useScenarioStore } from '@/store/useScenarioStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Copy, Check, Pencil, AlertTriangle } from 'lucide-react'
import { useState, useCallback, useMemo, useEffect } from 'react'
import type { ScenarioFile } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import { buildJsonDocs, SCENARIO_DOC_ID } from '@/lib/json-docs'
import type { JsonDoc } from '@/lib/json-docs'
import { parseDialogFile } from '@/lib/dialog-file'
import { validateDialogFlow } from '@/lib/validate'
import type { ValidationMessage } from '@/lib/validate'
import { BASE_LANGUAGE, type TranslationMap } from '@/lib/languages'
import UndockButton from '@/components/panels/UndockButton'

/** Parses `{"array": [...]}`, the shape every batched/single-entry custom
 *  JSON doc (heroes, map objects, artifacts, their logic/ground clones)
 *  ships as — same convention the real Core.zip DB files use. */
function parseArrayField(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text) as unknown
  const arr = (parsed as { array?: unknown } | null)?.array
  if (!Array.isArray(arr)) throw new Error('Expected an object with an "array" field, e.g. {"array": [...]}')
  return arr as Record<string, unknown>[]
}

/** Parses `{"tokens": [{"sid": "...", "text": "..."}, ...]}`, the shape a
 *  shipped Lang/*\/texts/*.json file uses. */
function parseTokensField(text: string): Record<string, string> {
  const parsed = JSON.parse(text) as unknown
  const tokens = (parsed as { tokens?: unknown } | null)?.tokens
  if (!Array.isArray(tokens)) throw new Error('Expected an object with a "tokens" array, e.g. {"tokens": [{"sid": "...", "text": "..."}]}')
  const map: Record<string, string> = {}
  for (const t of tokens as unknown[]) {
    const entry = t as { sid?: unknown; text?: unknown }
    if (typeof entry.sid !== 'string' || typeof entry.text !== 'string') {
      throw new Error('Each token needs a string "sid" and "text"')
    }
    map[entry.sid] = entry.text
  }
  return map
}

// ─── Syntax-highlight helper ──────────────────────────────────────────────────

function highlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'json-num' // number
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'json-key' : 'json-str' // key : string
        } else if (/true|false/.test(match)) {
          cls = 'json-bool'
        } else if (/null/.test(match)) {
          cls = 'json-null'
        }
        return `<span class="${cls}">${match}</span>`
      },
    )
}

// ─── Save handlers ────────────────────────────────────────────────────────────

/** Applies an edited document. The three batched-array handlers (map object/
 *  artifact templates, artifact ground objects) can only update EXISTING
 *  entries matched by id — adding/removing a custom entity from its raw JSON
 *  isn't supported (there's no way to validate a brand-new one has the other
 *  fields — sourceObjectId, logic, etc. — its CustomXDefinition needs); they
 *  return an error string naming the unmatched id(s) instead. */
export interface JsonSaveHandlers {
  onSaveScenario: (scenario: ScenarioFile) => void
  onSaveDialog: (docDialogId: string, flow: DialogFlow) => void
  onSaveLocalization: (lang: string, tokens: Record<string, string>) => void
  onSaveCustomHero: (heroSid: string, definition: Record<string, unknown>) => void
  onSaveCustomMapObjectTemplates: (templates: Record<string, unknown>[]) => string | void
  onSaveCustomMapObjectLogic: (objectId: string, logic: Record<string, unknown>) => void
  onSaveCustomArtifactTemplates: (templates: Record<string, unknown>[]) => string | void
  onSaveCustomArtifactMapObjects: (templates: Record<string, unknown>[]) => string | void
}

// ─── Content (used by both docked and undocked) ───────────────────────────────
// Does NOT include the panel title or UndockButton — those come from the
// containing shell (docked: JsonPreview header; undocked: PanelShell header).

interface JsonPreviewContentProps {
  scenario: ScenarioFile
  dialogs?: Record<string, DialogFlow>
  localization?: Record<string, string>
  translations?: TranslationMap
  customHeroes?: Record<string, CustomHeroDefinition>
  customMapObjects?: Record<string, CustomMapObjectDefinition>
  customArtifacts?: Record<string, CustomArtifactDefinition>
  mapName?: string
  /** When provided, shows an Edit button that lets the user edit the JSON inline. */
  handlers?: JsonSaveHandlers
}

export function JsonPreviewContent({
  scenario,
  dialogs = {},
  localization = {},
  translations = {},
  customHeroes = {},
  customMapObjects = {},
  customArtifacts = {},
  mapName = '',
  handlers,
}: JsonPreviewContentProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editDirty, setEditDirty] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationMessage[]>([])
  const [issuesAreErrors, setIssuesAreErrors] = useState(false)
  const [docId, setDocId] = useState<string>(SCENARIO_DOC_ID)

  const docs = useMemo(
    () => buildJsonDocs(scenario, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, mapName),
    [scenario, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, mapName],
  )

  // Fall back to the scenario if the selected dialog was renamed or deleted
  useEffect(() => {
    if (!docs.some((d) => d.id === docId)) setDocId(SCENARIO_DOC_ID)
  }, [docs, docId])

  const doc: JsonDoc = docs.find((d) => d.id === docId) ?? docs[0]
  const json = doc.text
  const showSwitcher = docs.length > 1

  const clearEditState = useCallback(() => {
    setIsEditing(false)
    setEditValue('')
    setEditDirty(false)
    setParseError(null)
    setIssues([])
    setIssuesAreErrors(false)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const handleEdit = useCallback(() => {
    setEditValue(json)
    setEditDirty(false)
    setParseError(null)
    setIssues([])
    setIssuesAreErrors(false)
    setIsEditing(true)
  }, [json])

  const handleDocChange = useCallback(
    (next: string) => {
      // Editing is per-document — switching away discards the draft
      clearEditState()
      setDocId(next)
    },
    [clearEditState],
  )

  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setEditValue(val)
    setEditDirty(val !== json)
    setParseError(null)
  }, [json])

  const handleSave = useCallback(() => {
    if (!handlers) return

    // ── Scenario document ────────────────────────────────────────────────────
    if (doc.kind === 'scenario') {
      try {
        const parsed = JSON.parse(editValue) as ScenarioFile
        handlers.onSaveScenario(parsed)
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Dialog document ──────────────────────────────────────────────────────
    if (doc.kind === 'dialog') {
      const { flow, errors: parseErrors } = parseDialogFile(editValue)
      if (!flow) {
        setParseError(parseErrors.join(' '))
        return
      }

      const result = validateDialogFlow(flow, localization)
      if (result.errors.length > 0) {
        setParseError(null)
        setIssues(result.errors)
        setIssuesAreErrors(true)
        return
      }

      handlers.onSaveDialog(doc.dialogId!, flow)
      clearEditState()
      return
    }

    // ── Localization / translations ─────────────────────────────────────────
    if (doc.kind === 'localization') {
      try {
        handlers.onSaveLocalization(doc.lang!, parseTokensField(editValue))
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Custom hero ──────────────────────────────────────────────────────────
    if (doc.kind === 'customHero') {
      try {
        const arr = parseArrayField(editValue)
        if (arr.length !== 1) throw new Error('Expected exactly one hero definition in "array"')
        handlers.onSaveCustomHero(doc.heroSid!, arr[0])
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Custom map object templates (batched) ───────────────────────────────
    if (doc.kind === 'customMapObjectTemplates') {
      try {
        const error = handlers.onSaveCustomMapObjectTemplates(parseArrayField(editValue))
        if (error) { setParseError(error); return }
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Custom map object logic (one file per object) ───────────────────────
    if (doc.kind === 'customMapObjectLogic') {
      try {
        const arr = parseArrayField(editValue)
        if (arr.length !== 1) throw new Error('Expected exactly one logic entry in "array"')
        handlers.onSaveCustomMapObjectLogic(doc.objectId!, arr[0])
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Custom artifact templates (batched) ─────────────────────────────────
    if (doc.kind === 'customArtifactTemplates') {
      try {
        const error = handlers.onSaveCustomArtifactTemplates(parseArrayField(editValue))
        if (error) { setParseError(error); return }
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
      return
    }

    // ── Custom artifact ground-placement objects (batched) ──────────────────
    if (doc.kind === 'customArtifactMapObjects') {
      try {
        const error = handlers.onSaveCustomArtifactMapObjects(parseArrayField(editValue))
        if (error) { setParseError(error); return }
        clearEditState()
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON')
      }
    }
  }, [handlers, doc, editValue, localization, clearEditState])

  // ── Switcher (shared between read and edit modes) ──────────────────────────
  const switcher = showSwitcher && (
    <Select value={docId} onValueChange={handleDocChange}>
      <SelectTrigger className="h-6 w-[168px] text-xs shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {docs.map((d) => (
          <SelectItem key={d.id} value={d.id} className="text-xs">
            {d.kind === 'dialog' ? `Dialog: ${d.label}` : d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const issueList = issues.length > 0 && (
    <div
      className={`shrink-0 border-b px-3 py-2 text-xs space-y-1 ${
        issuesAreErrors
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-600/40 bg-amber-500/10 text-amber-600'
      }`}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3 w-3" />
        {issuesAreErrors ? 'Fix these before saving' : 'Warnings'}
      </div>
      {issues.map((m, i) => (
        <p key={i} className="pl-4">
          <span className="opacity-70">{m.path}</span> — {m.message}
        </p>
      ))}
    </div>
  )

  if (isEditing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-border px-3 py-1 shrink-0 min-w-0">
          {switcher}
          {parseError && (
            <span className="truncate text-xs text-destructive mx-2 flex-1" title={parseError}>
              {parseError}
            </span>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs shrink-0"
            onClick={clearEditState}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs shrink-0"
            onClick={handleSave}
            disabled={!editDirty}
          >
            Save
          </Button>
        </div>
        {issueList}
        <textarea
          className="flex-1 min-h-0 w-full resize-none p-3 text-xs font-mono leading-relaxed bg-background text-foreground/90 focus:outline-none overflow-auto"
          value={editValue}
          onChange={handleEditChange}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-3 py-1 shrink-0">
        {switcher}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {handlers && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={handleEdit}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
        )}
      </div>
      {showSwitcher && (
        <div className="shrink-0 border-b border-border px-3 py-1">
          <code className="text-[10px] text-muted-foreground">{doc.pathHint}</code>
        </div>
      )}
      <ScrollArea className="flex-1 min-h-0">
        <pre
          className="p-3 text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: highlight(json) }}
        />
      </ScrollArea>
    </div>
  )
}

// ─── Docked panel (reads from store, adds UndockButton) ───────────────────────

interface JsonPreviewProps {
  /** Called when the user clicks the undock button. Tauri-only. */
  onUndock?: () => void
  /** True while the panel is already open in a separate window. */
  undocked?: boolean
}

export default function JsonPreview({ onUndock, undocked }: JsonPreviewProps) {
  const {
    scenario, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, mapName,
    setScenario, setDialogFlow, removeDialogFlow, setLocalizationBatch, setTranslationBatch,
    setCustomHero, setCustomMapObject, setCustomArtifact,
  } = useScenarioStore()

  // Batched docs (map object/artifact templates, artifact ground objects) can
  // only update entries that already exist — matched by each entry's own
  // `id` field, which is always identical to its customMapObjects/
  // customArtifacts store key (see CustomObjectEditorDialog/
  // CustomArtifactEditorDialog's handleSave). Returns an error string
  // naming any id that doesn't match an existing entry, or undefined on
  // success.
  function applyBatchedTemplates<T extends { template: Record<string, unknown> }>(
    existing: Record<string, T>,
    templates: Record<string, unknown>[],
    setOne: (id: string, next: T) => void,
    noun: string,
  ): string | void {
    const unknownIds: string[] = []
    for (const template of templates) {
      const id = typeof template.id === 'string' ? template.id : ''
      if (!id || !(id in existing)) {
        unknownIds.push(id || '(missing id)')
        continue
      }
      setOne(id, { ...existing[id], template })
    }
    if (unknownIds.length > 0) {
      return `Unknown ${noun} id(s): ${unknownIds.join(', ')} — add new ones via the sidebar, not here.`
    }
  }

  const handlers: JsonSaveHandlers = useMemo(
    () => ({
      onSaveScenario: (parsed) => {
        setScenario(parsed)
        useScenarioStore.setState({ isDirty: true })
      },
      onSaveDialog: (docDialogId, flow) => {
        // Hand-editing the "id" renames the flow — drop the old key first, the
        // same way the Dialog Editor's ID field does.
        if (flow.id !== docDialogId) removeDialogFlow(docDialogId)
        setDialogFlow(flow.id, flow)
      },
      onSaveLocalization: (lang, tokens) => {
        // Merge-only, same as the localization dialog's own batch editor —
        // a token omitted from the edited JSON isn't deleted, only ones
        // present get updated/added.
        if (lang === BASE_LANGUAGE) setLocalizationBatch(tokens)
        else setTranslationBatch(lang, tokens)
      },
      onSaveCustomHero: (heroSid, definition) => {
        const existing = customHeroes[heroSid]
        if (!existing) return
        setCustomHero(heroSid, { ...existing, definition })
      },
      onSaveCustomMapObjectTemplates: (templates) =>
        applyBatchedTemplates(customMapObjects, templates, setCustomMapObject, 'object'),
      onSaveCustomMapObjectLogic: (objectId, logic) => {
        const existing = customMapObjects[objectId]
        if (!existing) return
        setCustomMapObject(objectId, { ...existing, logic })
      },
      onSaveCustomArtifactTemplates: (templates) =>
        applyBatchedTemplates(customArtifacts, templates, setCustomArtifact, 'artifact'),
      onSaveCustomArtifactMapObjects: (templates) => {
        const unknownIds: string[] = []
        for (const template of templates) {
          const id = typeof template.id === 'string' ? template.id : ''
          if (!id || !(id in customArtifacts)) {
            unknownIds.push(id || '(missing id)')
            continue
          }
          setCustomArtifact(id, { ...customArtifacts[id], mapObjectTemplate: template })
        }
        if (unknownIds.length > 0) {
          return `Unknown artifact id(s): ${unknownIds.join(', ')} — ground objects must match an existing custom artifact's id.`
        }
      },
    }),
    [
      setScenario, setDialogFlow, removeDialogFlow, setLocalizationBatch, setTranslationBatch,
      customHeroes, setCustomHero, customMapObjects, setCustomMapObject, customArtifacts, setCustomArtifact,
    ],
  )

  return (
    <div className="group flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">JSON Preview</span>
        {onUndock && (
          <UndockButton panelId="preview" onUndock={onUndock} disabled={undocked} />
        )}
      </div>
      <div className="flex-1 min-h-0">
        <JsonPreviewContent
          scenario={scenario}
          dialogs={dialogs}
          localization={localization}
          translations={translations}
          customHeroes={customHeroes}
          customMapObjects={customMapObjects}
          customArtifacts={customArtifacts}
          mapName={mapName}
          handlers={handlers}
        />
      </div>
    </div>
  )
}
