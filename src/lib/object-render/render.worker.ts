// One render worker: gets an object's exported files, answers with the finished PNG. render-job.ts runs several of these
// at once; each owns its own WebGL context, which is what overlaps the CPU-bound setup of one object with the GPU work
// of another (the GPU itself sits mostly idle with a single renderer).

import './worker-shim'
import { renderObject, type RenderRequest, type RenderResult } from './render-core'

export type WorkerMessage = { id: number; request: RenderRequest }
export type WorkerReply = { id: number; result: RenderResult } | { id: number; error: string }

self.onmessage = async (ev: MessageEvent<WorkerMessage>) => {
  const { id, request } = ev.data
  try {
    const result = await renderObject(request)
    ;(self as unknown as Worker).postMessage({ id, result } satisfies WorkerReply, [result.png, ...(result.mask ? [result.mask] : [])])
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies WorkerReply)
  }
}
