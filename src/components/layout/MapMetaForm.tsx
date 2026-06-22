import { useScenarioStore } from '@/store/useScenarioStore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function MapMetaForm() {
  const { mapName, setMapName } = useScenarioStore()

  const sidPrefix = mapName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

  return (
    <div className="p-4 space-y-5">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Map Settings
      </h2>

      <div className="space-y-1.5">
        <Label>Map Name</Label>
        <Input
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
          placeholder="My Custom Map"
        />
        <p className="text-xs text-muted-foreground">
          Used as the folder name inside the export ZIP (e.g.{' '}
          <code>DB/dialogs/dialogs/custom_maps/My Custom Map/</code>).
        </p>
      </div>

      {sidPrefix && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Suggested SID prefix</Label>
          <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded">
            {sidPrefix}_
          </code>
        </div>
      )}

      <p className="text-xs text-muted-foreground border border-border rounded p-2 bg-muted/30">
        Select an item in the sidebar to edit it, or use the <strong>Dialogs</strong> section to
        manage dialog flows and the <strong>Localization</strong> button to edit text.
      </p>
    </div>
  )
}
