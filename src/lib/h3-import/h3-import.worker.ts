// Web Worker entry for the H3 import (see h3-import-job.ts): one job per worker.

import { runH3ImportJob, type H3ImportJobInput } from './h3-import-job'

export type H3WorkerMessage =
  | { type: 'progress'; stage: string; pct: number }
  | { type: 'done'; result: Awaited<ReturnType<typeof runH3ImportJob>> }
  | { type: 'error'; message: string }

const post = (message: H3WorkerMessage) => (self as unknown as { postMessage: (m: H3WorkerMessage) => void }).postMessage(message)

self.onmessage = async (event: MessageEvent<H3ImportJobInput>) => {
  try {
    const result = await runH3ImportJob(event.data, (_label, pct, stage) => post({ type: 'progress', stage: stage ?? '', pct }))
    post({ type: 'done', result })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
