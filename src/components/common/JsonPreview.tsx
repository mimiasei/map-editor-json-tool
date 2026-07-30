import { useScenarioStore } from '@/store/useScenarioStore'
import { exportScenario } from '@/lib/export'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Copy, Check, Pencil } from 'lucide-react'
import { useState, useCallback } from 'react'
import type { ScenarioFile } from '@/types/scenario'
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

// ─── Content (used by both docked and undocked) ───────────────────────────────
// Does NOT include the panel title or UndockButton — those come from the
// containing shell (docked: JsonPreview header; undocked: PanelShell header).

interface JsonPreviewContentProps {
  scenario: ScenarioFile
  /** When provided, shows an Edit button that lets the user edit the JSON inline. */
  onSave?: (scenario: ScenarioFile) => void
}

export function JsonPreviewContent({ scenario, onSave }: JsonPreviewContentProps) {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [editDirty, setEditDirty] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const json = exportScenario(scenario)

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
    setIsEditing(true)
  }, [json])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditValue('')
    setEditDirty(false)
    setParseError(null)
  }, [])

  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setEditValue(val)
    setEditDirty(val !== json)
    setParseError(null)
  }, [json])

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(editValue) as ScenarioFile
      onSave?.(parsed)
      setIsEditing(false)
      setEditValue('')
      setEditDirty(false)
      setParseError(null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [editValue, onSave])

  if (isEditing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end gap-1 border-b border-border px-3 py-1 shrink-0 min-w-0">
          {parseError && (
            <span className="truncate text-xs text-destructive mr-auto" title={parseError}>
              {parseError}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs shrink-0"
            onClick={handleCancel}
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
      <div className="flex items-center justify-end gap-1 border-b border-border px-3 py-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {onSave && (
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
  const { scenario, setScenario } = useScenarioStore()

  const handleJsonSave = useCallback((parsed: ScenarioFile) => {
    setScenario(parsed)
    useScenarioStore.setState({ isDirty: true })
  }, [setScenario])

  return (
    <div className="group flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">JSON Preview</span>
        {onUndock && (
          <UndockButton panelId="preview" onUndock={onUndock} disabled={undocked} />
        )}
      </div>
      <div className="flex-1 min-h-0">
        <JsonPreviewContent scenario={scenario} onSave={handleJsonSave} />
      </div>
    </div>
  )
}
