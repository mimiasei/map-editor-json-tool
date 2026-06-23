import AppShell from '@/components/layout/AppShell'
import PanelShell from '@/components/panels/PanelShell'
import { isTauri } from '@/lib/native-fs'

// Detect ?panel=<id> at module load time (stable for the lifetime of the window)
const panelId = new URLSearchParams(location.search).get('panel')

export default function App() {
  if (panelId && isTauri()) return <PanelShell panelId={panelId} />
  return <AppShell />
}
