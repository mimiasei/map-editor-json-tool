// TEMPORARY: logs hooks that take over a few ms, to find why map edits lag on a dense map. Delete with the timing in useMapDocumentStore.
export function timed<T>(label: string, fn: () => T): T {
  const t = performance.now()
  const result = fn()
  const ms = performance.now() - t
  if (ms >= 8) console.info(`[perf] ${label}: ${ms.toFixed(0)}ms`)
  return result
}

/** Wraps an effect body; the effect's own cleanup is passed through. */
export function timedEffect(label: string, fn: () => void | (() => void)): void | (() => void) {
  return timed(label, fn)
}
