import { useScenarioStore } from '@/store/useScenarioStore'

export default function MapMetaForm() {
  const { mapName } = useScenarioStore()

  const sidPrefix = mapName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

  return (
    <div className="p-4 space-y-4 text-sm text-muted-foreground">
      <p>
        Select an item in the sidebar to edit it.
      </p>
      {sidPrefix ? (
        <p>
          Suggested SID prefix:{' '}
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{sidPrefix}_</code>
        </p>
      ) : (
        <p className="border border-border rounded p-2 bg-muted/30 text-xs">
          Enter a <strong>Map Name</strong> in the sidebar to get a suggested SID prefix and
          enable ZIP export.
        </p>
      )}
    </div>
  )
}
