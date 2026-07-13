import type { PanelState, PanelAction } from '@/lib/panel-sync'
import { JsonPreviewContent } from '@/components/common/JsonPreview'
import { TimelineContent } from '@/components/common/TimelineDialog'
import { QuestFlowContent } from '@/components/common/QuestFlowDialog'
import { StatsContent } from '@/components/common/StatsDialog'
import { GuidesContent } from '@/components/guides/GuidesPanel'

interface Props {
  panelId: string
  state: PanelState
  sendAction: (action: PanelAction) => void
}

/**
 * Renders the appropriate content component for the given panel ID.
 * Used by PanelShell (undocked Tauri windows).
 * All content components receive data as props — they do NOT read from
 * the local Zustand store (which is empty in undocked windows).
 */
export default function PanelContent({ panelId, state, sendAction }: Props) {
  const { scenario, selectedType: _selectedType, selectedPath: _selectedPath } = state

  switch (panelId) {
    case 'preview':
      return <JsonPreviewContent scenario={scenario} />

    case 'timeline':
      return (
        <TimelineContent
          scenario={scenario}
          onSelect={(type, path) => sendAction({ name: 'setSelection', args: [type, path] })}
          closeOnNav={false}
        />
      )

    case 'flow':
      return (
        <QuestFlowContent
          scenario={scenario}
          onNavigate={(type, path) => sendAction({ name: 'setSelection', args: [type, path] })}
          alwaysOpen
        />
      )

    case 'stats':
      return (
        <StatsContent
          scenario={scenario}
          onNavigate={(type, path) => sendAction({ name: 'setSelection', args: [type, path] })}
          alwaysOpen
        />
      )

    case 'guides':
      return <GuidesContent />

    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Unknown panel: {panelId}
        </div>
      )
  }
}
