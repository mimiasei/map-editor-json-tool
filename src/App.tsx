import AppShell from '@/components/layout/AppShell'
import PanelShell from '@/components/panels/PanelShell'

// Detect ?panel=<id> at module load time (stable for the lifetime of the window)
const panelId = new URLSearchParams(location.search).get('panel')

export default function App() {
  if (panelId) return <PanelShell panelId={panelId} />
  return <AppShell />
}
