import AppShell from '@/components/layout/AppShell'
import PanelShell from '@/components/panels/PanelShell'
import { isTauri } from '@/lib/native-fs'
import { TooltipProvider } from '@/components/ui/tooltip'

// Detect ?panel=<id> at module load time (stable for the lifetime of the window)
const panelId = new URLSearchParams(location.search).get('panel')

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      {panelId && isTauri() ? <PanelShell panelId={panelId} /> : <AppShell />}
    </TooltipProvider>
  )
}
