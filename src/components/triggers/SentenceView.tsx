// ─── Card view: renders a formatted condition/action sentence with clickable
// hero/object/node tokens (issue: Card view clickable links) ────────────────
// Clicking a linked token opens info about it instead of the card's own edit
// action — every click handler here stops propagation so the card's outer
// onClick (open the edit Sheet) never also fires.

import { Eye } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { openMapAtNode } from '@/lib/trigger-card-links'
import type { SentenceSegment } from '@/lib/trigger-visual'
import type { GameCatalog } from '@/lib/catalog/types'
import type { DialogFlow } from '@/types/dialog'
import { cn } from '@/lib/utils'

function dialogPreviewText(
  sid: string,
  catalog: GameCatalog | null,
  scenarioDialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
): string {
  // Dialogs authored in this scenario (via DialogEditor/quick-create) live in the scenario
  // store, keyed by dialog sid, with each slide's text as a localization sid — not in the
  // game catalog, which only holds Core.zip's own shipped dialogs. Check the scenario's own
  // dialogs first so a freshly-created dialog's text actually resolves here.
  const ownFlow = scenarioDialogs[sid]
  if (ownFlow) {
    const text = ownFlow.slides
      .map((s) => (s.text ? localization[s.text] : undefined))
      .filter(Boolean)
      .join(' / ')
    return text || 'No localized text found for this dialog SID.'
  }

  const dialog = catalog?.dialogs.find((d) => d.id === sid)
  if (!dialog) return 'No localized text found for this dialog SID.'
  const text = dialog.slides.map((s) => s.text).filter(Boolean).join(' / ')
  return text || dialog.firstText || 'No localized text found for this dialog SID.'
}

interface Props {
  segments: SentenceSegment[]
  /** Node links only: called instead of plain navigation when provided, so
   *  the click can drive the "pick a different node, confirm Change/Cancel"
   *  edit flow (TriggerVisualBuilder's handlePickNodeFromCard) instead of
   *  just jumping the Map Grid to the node read-only. */
  onNodeClick?: (paramIndex: number, node: number) => void
}

export default function SentenceView({ segments, onNodeClick }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const scenarioDialogs = useScenarioStore((s) => s.dialogs)
  const localization = useScenarioStore((s) => s.localization)
  const openDatabaseItem = useViewBridgeStore((s) => s.openDatabaseItem)

  const activate = (segment: SentenceSegment) => {
    if (!segment.link) return
    if (segment.link.kind === 'node') {
      if (onNodeClick) onNodeClick(segment.link.paramIndex, segment.link.node)
      else openMapAtNode(segment.link.node)
    } else {
      openDatabaseItem(segment.link.tab, segment.link.id)
    }
  }

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.dialogSid) {
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-0.5 cursor-help"
                  onClick={(e) => e.stopPropagation()}
                >
                  {segment.text}
                  <Eye className="h-3 w-3 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap text-xs">
                {dialogPreviewText(segment.dialogSid, catalog, scenarioDialogs, localization)}
              </TooltipContent>
            </Tooltip>
          )
        }

        if (segment.link) {
          return (
            <span
              key={i}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                activate(segment)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  activate(segment)
                }
              }}
              className={cn(
                'cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary',
                segment.bold && 'font-semibold',
              )}
            >
              {segment.text}
            </span>
          )
        }

        return segment.bold ? <strong key={i}>{segment.text}</strong> : <span key={i}>{segment.text}</span>
      })}
    </>
  )
}
