// ─── View tabs (Map Grid | Scenario) ─────────────────────────────────────────
// The Map Grid, the random map generator and the scenario editor are mutually exclusive full-pane views swapped by AppShell
// (useViewBridgeStore). This strip makes that switch visible: the Map Grid is the main workspace for a loaded .map, so its tab is
// the largest of the tabs, instead of a small icon among the toolbar tools.

import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dices, LayoutGrid, Workflow } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { useMapContextStore } from '@/store/useMapContextStore'

export default function ViewTabs() {
  const { t } = useTranslation()
  const mapGridOpen = useViewBridgeStore((s) => s.mapGridOpen)
  const rmgOpen = useViewBridgeStore((s) => s.rmgOpen)
  const openMapGrid = useViewBridgeStore((s) => s.openMapGrid)
  const closeMapGrid = useViewBridgeStore((s) => s.closeMapGrid)
  const closeRmg = useViewBridgeStore((s) => s.closeRmg)
  // A pick started from the scenario editor owns the view switch until it resolves or is cancelled.
  const picking = useViewBridgeStore((s) => s.pendingPick !== null)
  const mapLoaded = useMapContextStore((s) => s.context !== null)

  const mapGridActive = mapGridOpen
  const scenarioActive = !mapGridOpen && !rmgOpen

  const gridDisabled = !mapLoaded || picking
  const gridTab = (
    <button
      type="button"
      disabled={gridDisabled}
      aria-current={mapGridActive ? 'page' : undefined}
      onClick={() => openMapGrid()}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        mapGridActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <LayoutGrid className="h-4 w-4" />
      {t('layout.viewTabs.mapGrid')}
    </button>
  )

  return (
    <nav className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5" aria-label={t('layout.viewTabs.label')}>
      {mapLoaded ? gridTab : (
        <Tooltip>
          {/* A disabled button swallows pointer events, so the tooltip hangs off a wrapper. */}
          <TooltipTrigger asChild><span tabIndex={0}>{gridTab}</span></TooltipTrigger>
          <TooltipContent>{t('layout.viewTabs.needsMap')}</TooltipContent>
        </Tooltip>
      )}
      <button
        type="button"
        disabled={picking}
        aria-current={scenarioActive ? 'page' : undefined}
        onClick={() => { closeMapGrid(); closeRmg() }}
        className={cn(
          'flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          scenarioActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <Workflow className="h-4 w-4" />
        {t('layout.viewTabs.scenario')}
      </button>
      {rmgOpen && (
        <span className="flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground" aria-current="page">
          <Dices className="h-4 w-4" />
          {t('layout.viewTabs.randomMap')}
        </span>
      )}
    </nav>
  )
}
