import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { exportProjectJson } from '@/lib/export'
import { buildMapZipBlob, mapZipFileName } from '@/lib/zip-export'
import { resolvePublishTargets, targetsReady } from '@/lib/publish'
import type { PublishTargets } from '@/lib/publish'
import { pickSavePath, saveToPath, writeBinaryFile } from '@/lib/native-fs'
import { validateScenario } from '@/lib/validate'
import { languagesWithContent, languageLabel, shippedLanguages } from '@/lib/languages'
import { logError, logInfo } from '@/lib/logger'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertTriangle,
  Check,
  FileJson,
  FolderOpen,
  Loader2,
  Package,
  Upload,
} from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase = 'confirm' | 'working' | 'done'

// ─── One target row ───────────────────────────────────────────────────────────

function TargetRow({
  icon,
  label,
  path,
  exists,
  reason,
  onChoose,
}: {
  icon: React.ReactNode
  label: string
  path: string | null
  exists: boolean
  reason?: string
  onChoose: () => void
}) {
  return (
    <div className="rounded border border-border bg-card p-2 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
        {path && exists && (
          <Badge variant="secondary" className="text-amber-500 text-xs">
            overwrites
          </Badge>
        )}
        {path && !exists && (
          <Badge variant="secondary" className="text-xs">
            new file
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 text-xs"
          onClick={onChoose}
        >
          <FolderOpen className="h-3 w-3" />
          {path ? 'Change…' : 'Choose…'}
        </Button>
      </div>
      {path ? (
        <code className="block break-all text-[11px] text-muted-foreground">{path}</code>
      ) : (
        <p className="text-[11px] text-amber-500">{reason}</p>
      )}
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export default function PublishDialog({ open, onOpenChange }: Props) {
  const { scenario, mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs, sidecarPath, currentFilePath, markClean, markZipPublished } =
    useScenarioStore()

  const [targets, setTargets] = useState<PublishTargets | null>(null)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [error, setError] = useState<string | null>(null)

  // Re-resolve every time the dialog opens — paths change as the user works
  useEffect(() => {
    if (!open) return
    setPhase('confirm')
    setError(null)
    setTargets(null)
    resolvePublishTargets({ sidecarPath, currentFilePath, mapName }).then(setTargets)
  }, [open, sidecarPath, currentFilePath, mapName])

  const speakerTitles = useCatalogStore((s) => s.catalog?.speakerTitles)
  const knownGameSids = useMemo(
    () => new Set((speakerTitles ?? []).map((t) => t.sid)),
    [speakerTitles],
  )
  const validation = validateScenario(scenario, {
    mapName,
    dialogs,
    localization,
    knownGameSids,
  })
  const extraLanguages = languagesWithContent(translations)
  const shipped = shippedLanguages(translations)

  const chooseJson = useCallback(async () => {
    const picked = await pickSavePath(
      targets?.json.path ?? 'scenario.json',
      { name: 'JSON', extensions: ['json'] },
      'Where to write the scenario JSON',
    )
    if (picked) {
      setTargets((t) => (t ? { ...t, json: { path: picked, exists: false } } : t))
    }
  }, [targets])

  const chooseZip = useCallback(async () => {
    const picked = await pickSavePath(
      targets?.zip.path ?? mapZipFileName(mapName || 'map'),
      { name: 'ZIP Archive', extensions: ['zip'] },
      'Where to write the map ZIP',
    )
    if (picked) {
      setTargets((t) => (t ? { ...t, zip: { path: picked, exists: false } } : t))
    }
  }, [targets, mapName])

  const handlePublish = async () => {
    if (!targets || !targetsReady(targets)) return
    setPhase('working')
    setError(null)
    try {
      // Scenario JSON first — it is the file the game needs to load the map at all.
      const json = exportProjectJson(scenario, mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)
      await saveToPath(targets.json.path!, json)

      const blob = await buildMapZipBlob(mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)
      await writeBinaryFile(targets.zip.path!, new Uint8Array(await blob.arrayBuffer()))

      markClean()
      markZipPublished()
      logInfo(`Published ${mapName}`)
      setPhase('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Publish failed: ${msg}`)
      setError(msg)
      setPhase('confirm')
    }
  }

  const ready = !!targets && targetsReady(targets)
  const blocked = validation.errors.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={640}
        defaultHeight={560}
        minWidth={480}
        minHeight={360}
        storageKey="publish"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
          <DialogTitle>Publish map</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Writes the scenario JSON next to your .map file and the ZIP into StreamingAssets.
          </p>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 space-y-3">
            {phase === 'done' ? (
              <div className="flex items-start gap-2 rounded border border-green-600/40 bg-green-500/10 p-3">
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-xs">
                  <p className="font-medium text-green-600">Published.</p>
                  <code className="block break-all text-muted-foreground">
                    {targets?.json.path}
                  </code>
                  <code className="block break-all text-muted-foreground">
                    {targets?.zip.path}
                  </code>
                  {/* Name the language files that landed — a missing translation
                      used to fail silently. */}
                  <p className="text-muted-foreground">
                    {shipped.length} language file{shipped.length !== 1 ? 's' : ''}:{' '}
                    {shipped.map(languageLabel).join(', ')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {!targets ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving destinations…
                  </p>
                ) : (
                  <>
                    <TargetRow
                      icon={<FileJson className="h-3.5 w-3.5 text-muted-foreground" />}
                      label="Scenario JSON"
                      path={targets.json.path}
                      exists={targets.json.exists}
                      reason={targets.json.reason}
                      onChoose={chooseJson}
                    />
                    <TargetRow
                      icon={<Package className="h-3.5 w-3.5 text-muted-foreground" />}
                      label="Map ZIP"
                      path={targets.zip.path}
                      exists={targets.zip.exists}
                      reason={targets.zip.reason}
                      onChoose={chooseZip}
                    />
                  </>
                )}

                {/* What goes into the ZIP */}
                <div className="rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground space-y-0.5">
                  <p>
                    {Object.keys(dialogs).length} dialog
                    {Object.keys(dialogs).length !== 1 ? 's' : ''}
                    {' · '}
                    {Object.keys(localization).length} English token
                    {Object.keys(localization).length !== 1 ? 's' : ''}
                  </p>
                  {extraLanguages.length > 0 && (
                    <p>
                      Also shipping: {extraLanguages.map(languageLabel).join(', ')}
                    </p>
                  )}
                </div>

                {/* Validation */}
                {blocked && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 space-y-1 text-xs text-destructive">
                    <p className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      {validation.errors.length} error
                      {validation.errors.length !== 1 ? 's' : ''} — fix before publishing
                    </p>
                    {validation.errors.slice(0, 6).map((m, i) => (
                      <p key={i} className="pl-4">
                        <span className="opacity-70">{m.path}</span> — {m.message}
                      </p>
                    ))}
                    {validation.errors.length > 6 && (
                      <p className="pl-4 opacity-70">
                        …and {validation.errors.length - 6} more
                      </p>
                    )}
                  </div>
                )}
                {!blocked && validation.warnings.length > 0 && (
                  <p className="flex items-center gap-1.5 rounded border border-amber-600/40 bg-amber-500/10 p-2 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {validation.warnings.length} warning
                    {validation.warnings.length !== 1 ? 's' : ''} — publishing anyway is fine
                  </p>
                )}

                {error && (
                  <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {phase !== 'done' && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!ready || blocked || phase === 'working'}
              onClick={handlePublish}
            >
              {phase === 'working' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Publish
            </Button>
          )}
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
