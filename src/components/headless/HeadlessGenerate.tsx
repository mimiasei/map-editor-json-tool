// ─── Headless random-map generation (issue #258) ─────────────────────────────
// Rendered INSTEAD of <App/> when TSE is launched with --generate by the GME
// BepInEx mod, so none of AppShell's startup work (session restore, setup
// wizard, updater, thumbnail warm-up) runs. Generates one Classic-mode map,
// writes it to --output, optionally writes a --result JSON, then exits with a
// code the mod can read (see headless-args.ts for the codes).

import { useEffect, useRef, useState } from 'react'
import { ProgressStatus } from '@/components/common/ProgressStatus'
import { useCatalogStore } from '@/store/useCatalogStore'
import { generateRandomMapBytes } from '@/lib/rmg/generate-map-file'
import { buildClassicOptions } from '@/lib/rmg/classic-presets'
import { loadClassicTuning } from '@/lib/rmg/load-tuning'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { parseHeadlessArgs, EXIT_OK, EXIT_FAILED, EXIT_BAD_ARGS, EXIT_NO_CATALOG } from '@/lib/rmg/headless-args'
import { setHeadlessYield } from '@/lib/async-utils'
import { writeBinaryFile } from '@/lib/native-fs'
import { logError, logInfo } from '@/lib/logger'

interface Props {
  args: Record<string, string | undefined>
}

async function finish(code: number, resultPath: string | null, result: Record<string, unknown>): Promise<void> {
  if (resultPath) {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      await writeTextFile(resultPath, JSON.stringify({ exitCode: code, ...result }, null, 2))
    } catch (e) {
      logError(`Headless: could not write result file "${resultPath}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const { exit } = await import('@tauri-apps/plugin-process')
  await exit(code)
}

export default function HeadlessGenerate({ args }: Props) {
  const [progress, setProgress] = useState({ pct: 0, label: 'Starting…' })
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const resultPath = args.result?.trim() || null

    void (async () => {
      let parsed: ReturnType<typeof parseHeadlessArgs>
      try {
        parsed = parseHeadlessArgs(args)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        logError(`Headless: bad arguments — ${message}`)
        setError(message)
        return finish(EXIT_BAD_ARGS, resultPath, { ok: false, error: message })
      }

      try {
        setHeadlessYield(true)
        setProgress({ pct: 0, label: 'Loading game data…' })
        await useCatalogStore.getState().load()
        if (!useCatalogStore.getState().catalog) {
          const message = 'Game data (Core.zip) could not be loaded. Open TSE normally once and set it under More → Game Data.'
          logError(`Headless: ${message}`)
          setError(message)
          return finish(EXIT_NO_CATALOG, resultPath, { ok: false, error: message })
        }

        const seed = parsed.seed ?? Math.floor(Math.random() * 1_000_000_000)
        const rng = createSeededRng(seed)
        logInfo(`Headless: generating ${parsed.sizeX}x${parsed.sizeZ}, ${parsed.playerCount} players, seed ${seed} → ${parsed.output}`)

        const generated = await generateRandomMapBytes({
          mapName: parsed.mapName,
          onProgress: (label, pct) => setProgress({ label, pct }),
          sizeX: parsed.sizeX,
          sizeZ: parsed.sizeZ,
          playerCount: parsed.playerCount,
          playerSpawnerSid: 'city-spawner',
          ...buildClassicOptions(parsed.classic, rng, await loadClassicTuning(useCatalogStore.getState().catalog)),
          rng,
        })
        if (!generated) throw new Error('Headless generation requires the desktop build')

        await writeBinaryFile(parsed.output, generated.bytes)
        logInfo(`Headless: wrote ${parsed.output}`)
        return finish(EXIT_OK, resultPath, {
          ok: true,
          output: parsed.output,
          seed,
          sizeX: parsed.sizeX,
          sizeZ: parsed.sizeZ,
          playerCount: parsed.playerCount,
          ...parsed.classic,
          fairness: generated.playerBalance?.score ?? null,
          warnings: generated.warnings,
          unreachablePlacements: generated.unreachablePlacements.length,
          isolatedPlayerStarts: generated.isolatedPlayerStarts.length,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        logError(`Headless: generation failed — ${message}`)
        setError(message)
        return finish(EXIT_FAILED, resultPath, { ok: false, error: message })
      }
    })()
  }, [args])

  return (
    <div className="flex h-screen flex-col justify-center gap-2 bg-background p-5 text-foreground">
      <p className="text-sm font-medium">{error ? 'Map generation failed' : 'Generating random map…'}</p>
      {error ? <p className="text-xs text-destructive">{error}</p> : <ProgressStatus value={progress.pct} label={progress.label} />}
    </div>
  )
}
