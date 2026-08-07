import { useEffect } from 'react'
import type { PanelState, PanelAction } from '@/lib/panel-sync'
import { JsonPreviewContent } from '@/components/common/JsonPreview'
import { TimelineContent } from '@/components/common/TimelineDialog'
import { QuestFlowContent } from '@/components/common/QuestFlowDialog'
import { StatsContent } from '@/components/common/StatsDialog'
import { GuidesContent } from '@/components/guides/GuidesPanel'
import MapGridCellContent from '@/components/map-grid/MapGridCellContent'
import { terrainLabel } from '@/lib/map-grid/terrain-colors'
import { useCatalogStore } from '@/store/useCatalogStore'

// The mapGridCell panel is the one case here that needs the game catalog
// (for icons/category labels) — unlike scenario/dialogs/localization, the
// catalog is disk-backed reference data, not user-session state, so this
// window loads its own copy instead of receiving it over the broadcast
// channel (which every other field here does go through). Extracted into its
// own component, not inlined into the switch below, so its hooks are never
// conditionally called depending on panelId.
function MapGridCellPanel({ state }: { state: PanelState }) {
  const catalog = useCatalogStore((s) => s.catalog)
  useEffect(() => { useCatalogStore.getState().load() }, [])

  const { mapContext, selectedGridNode } = state
  if (!mapContext || selectedGridNode === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
        Click a tile in the Map Grid window to see its info here.
      </div>
    )
  }

  const items = mapContext.placedObjects.filter((p) => p.node === selectedGridNode)
  const label = terrainLabel(mapContext.tilesMap, mapContext.waterMap, selectedGridNode, mapContext.sizeX)
  const allPortals = mapContext.placedObjects.filter((p) => p.portalInfo)
  // Read-only mirror — no onRename/onSetDisplayName/onSetPortalTarget/onSetHighlightedNode
  // (issue #125 scope decision — edits and the grid-highlight overlay stay docked-only).
  return <MapGridCellContent items={items} terrainLabel={label} catalog={catalog} allPortals={allPortals} />
}

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
      // Read-only in undocked windows (no handlers) — the main window owns writes.
      return (
        <JsonPreviewContent
          scenario={scenario}
          dialogs={state.dialogs}
          localization={state.localization}
          mapName={state.mapName}
        />
      )

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

    case 'mapGridCell':
      return <MapGridCellPanel state={state} />

    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Unknown panel: {panelId}
        </div>
      )
  }
}
