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
import { buildJsonDocs, SCENARIO_DOC_ID } from '@/lib/json-docs'
import type { JsonDoc } from '@/lib/json-docs'
import { parseDialogFile } from '@/lib/dialog-file'
import { validateDialogFlow } from '@/lib/validate'
import type { ValidationMessage } from '@/lib/validate'
import UndockButton from '@/components/panels/UndockButton'

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

/** Applies an edited document. Returning messages means the save was rejected. */
export interface JsonSaveHandlers {
  onSaveScenario: (scenario: ScenarioFile) => void
  onSaveDialog: (docDialogId: string, flow: DialogFlow) => void
}

// ─── Content (used by both docked and undocked) ───────────────────────────────
// Does NOT include the panel title or UndockButton — those come from the
// containing shell (docked: JsonPreview header; undocked: PanelShell header).

interface JsonPreviewContentProps {
  scenario: ScenarioFile
  dialogs?: Record<string, DialogFlow>
  localization?: Record<string, string>
  mapName?: string
  /** When provided, shows an Edit button that lets the user edit the JSON inline. */
  handlers?: JsonSaveHandlers
}

export function JsonPreviewContent({
  scenario,
  dialogs = {},
  localization = {},
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
    () => buildJsonDocs(scenario, dialogs, mapName),
    [scenario, dialogs, mapName],
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

    // ── Dialog document ─────────────────────────────────────────────────────
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
      <ScrollArea className="flex-1">
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
  const { scenario, dialogs, localization, mapName, setScenario, setDialogFlow, removeDialogFlow } =
    useScenarioStore()

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
    }),
    [setScenario, setDialogFlow, removeDialogFlow],
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
          mapName={mapName}
          handlers={handlers}
        />
      </div>
    </div>
  )
}
