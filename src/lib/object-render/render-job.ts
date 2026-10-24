// ─── Render job ──────────────────────────────────────────────────────────────
// Three opt-in jobs, "interactables" first, then "decorations", then "cliffs" and "rivers" (the game's cliff and river pieces, listed by the sidecar next to the
// objects and rendered the same way). Each one
//   1. asks the sidecar which objects exist (Core.zip) and keeps only those missing from renders/index.json,
//   2. has the sidecar export their meshes (OBJ + textures) into <appLocalData>/meshes/<sid>/, one at a time,
//   3. renders every object as soon as its mesh is on disk, on a small pool of workers (render.worker.ts),
//   4. writes renders/<sid>.png, records it in index.json, and deletes the mesh folder.
// Export and rendering overlap, so the job takes about as long as the slower of the two. Cancelling keeps everything
// finished so far; starting again continues with what is still missing.

import { isTauri } from '@/lib/native-fs'
import { getGameDir } from '@/lib/game-dir'
import {
  IDLE_JOB,
  useObjectRenderStore,
  type JobName,
  type PendingCounts,
  type RenderIndex,
} from '@/store/useObjectRenderStore'
import { appDataDir, emptyIndex, loadRenderIndex, saveRenderIndex } from './render-index'
import { CANVAS_STEPS, CLIFF_AZIMUTH, CLIFF_ELEVATION, RIVER_ELEVATION, canvasForBounds } from './canvas-size'
import type { RenderRequest, RenderResult } from './render-core'
import type { WorkerMessage, WorkerReply } from './render.worker'

/** One object as listed by the sidecar (mesh_export.list_objects). */
interface ListedObject {
  sid: string
  job: JobName
  prefab: string
  offsetX: number
  offsetZ: number
  rot: number
  /** Cliff rims: render only above this height. */
  cut?: number
  noShadow?: boolean
  alias?: string
}

/** Workers rendering at once. The GPU is mostly idle with one, and three overlapped best in the measurements. */
const PARALLEL = 3
/** The index is saved this often so a crash or a cancel loses almost nothing. */
const SAVE_EVERY = 20

const JOBS: JobName[] = ['interactables', 'decorations', 'cliffs', 'rivers']

let listed: Promise<ListedObject[]> | null = null
let running: AbortController | null = null

export const isRenderJobRunning = () => running !== null

async function invokeMeshes<T>(mode: 'list-objects' | 'export-meshes', gameDir: string, outputDir: string, sids: string[]): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>('object_meshes', { mode, gameDir, outputDir, sids })
}

async function listObjects(gameDir: string): Promise<ListedObject[]> {
  listed ??= invokeMeshes<{ objects: ListedObject[] }>('list-objects', gameDir, '', []).then((r) => r.objects)
  listed.catch(() => { listed = null })
  return listed
}

function missing(objects: ListedObject[], index: RenderIndex, job: JobName): ListedObject[] {
  const skipped = new Set(index.skipped)
  return objects.filter((o) => o.job === job && !o.alias && !(o.sid in index.objects) && !skipped.has(o.sid))
}

/** Fill the "N objects waiting" counts the start prompt and the More menu show. Desktop only. */
export async function refreshPendingCounts(): Promise<PendingCounts | null> {
  const store = useObjectRenderStore.getState()
  const gameDir = await getGameDir()
  if (!isTauri() || !gameDir) return null
  if (!store.index) await loadRenderIndex()
  const index = useObjectRenderStore.getState().index ?? emptyIndex()
  try {
    const objects = await listObjects(gameDir)
    const pending = {
      interactables: missing(objects, index, 'interactables').length,
      decorations: missing(objects, index, 'decorations').length,
      cliffs: missing(objects, index, 'cliffs').length,
      rivers: missing(objects, index, 'rivers').length,
    }
    store.setPending(pending)
    return pending
  } catch {
    return null
  }
}

const exactBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

const fileNames = (meta: { materials: Record<string, { diffuse?: string; emissive?: string; alpha_min?: number }> }) => {
  const names = ['meta.json', 'model.obj']
  for (const [m, info] of Object.entries(meta.materials)) {
    if (info.diffuse) names.push(`${m}_diffuse.png`) // a material can have no texture at all
    if ((info.alpha_min ?? 255) < 255) names.push(`${m}_alpha.png`)
    if (info.emissive) names.push(`${m}_emissive.png`)
  }
  return names
}

class Pool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private waiting: ((w: Worker) => void)[] = []
  private nextId = 1
  private calls = new Map<number, { resolve: (r: RenderResult) => void; reject: (e: Error) => void }>()

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (ev: MessageEvent<WorkerReply>) => {
        const call = this.calls.get(ev.data.id)
        this.calls.delete(ev.data.id)
        if ('error' in ev.data) call?.reject(new Error(ev.data.error))
        else call?.resolve(ev.data.result)
      }
      this.workers.push(w)
      this.idle.push(w)
    }
  }

  private acquire(): Promise<Worker> {
    const w = this.idle.pop()
    return w ? Promise.resolve(w) : new Promise((resolve) => this.waiting.push(resolve))
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    const w = await this.acquire()
    const id = this.nextId++
    try {
      return await new Promise<RenderResult>((resolve, reject) => {
        this.calls.set(id, { resolve, reject })
        w.postMessage({ id, request } satisfies WorkerMessage)
      })
    } finally {
      const next = this.waiting.shift()
      if (next) next(w)
      else this.idle.push(w)
    }
  }

  terminate() {
    for (const w of this.workers) w.terminate()
    for (const c of this.calls.values()) c.reject(new Error('cancelled'))
  }
}

/** Run one job to the end (or until cancelled). Resolves when done; never throws, the outcome is in the store's job state. */
export async function runRenderJob(job: JobName): Promise<void> {
  if (running || !isTauri()) return
  const store = useObjectRenderStore.getState()
  const abort = (running = new AbortController())
  store.setJob({ ...IDLE_JOB, phase: 'preparing', job })
  let pool: Pool | null = null
  try {
    const gameDir = await getGameDir()
    if (!gameDir) throw new Error('The game folder was not found.')
    if (!useObjectRenderStore.getState().index) await loadRenderIndex()
    const index: RenderIndex = structuredClone(useObjectRenderStore.getState().index ?? emptyIndex())
    const dir = await appDataDir()
    const objects = await listObjects(gameDir)
    for (const o of objects) if (o.job === job && o.alias) index.aliases[o.sid] = o.alias
    const { readFile, readTextFile, writeFile, mkdir, remove } = await import('@tauri-apps/plugin-fs')
    if (job === 'cliffs') {
      // Renders of cliff pieces that are no longer listed (an older camera angle or naming) would only take space.
      const current = new Set(objects.filter((o) => o.job === 'cliffs').map((o) => o.sid))
      for (const sid of Object.keys(index.objects)) {
        if (!sid.startsWith('cliff_') || current.has(sid)) continue
        delete index.objects[sid]
        await remove(`${dir}renders/${sid}.png`).catch(() => undefined)
        await remove(`${dir}renders/${sid}_m.png`).catch(() => undefined)
      }
    }
    const todo = missing(objects, index, job)
    const bySid = new Map(todo.map((o) => [o.sid, o]))
    await mkdir(`${dir}renders`, { recursive: true })
    await mkdir(`${dir}meshes`, { recursive: true })
    store.setJob({ phase: 'exporting', total: todo.length })
    if (todo.length === 0) {
      await saveRenderIndex(index)
      store.setJob({ phase: 'done' })
      return
    }

    const { listen } = await import('@tauri-apps/api/event')
    pool = new Pool(PARALLEL)
    const ready: string[] = []
    let exportDone = false
    const wakers: (() => void)[] = []
    const notify = () => { for (const w of wakers.splice(0)) w() }
    let finished = 0
    let unsaved = 0
    const failed: string[] = []

    const unlisten = await listen<{ type: string; sid: string; status?: string }>('mesh-event', (ev) => {
      if (ev.payload.type !== 'object') return
      if (ev.payload.status === 'ok') ready.push(ev.payload.sid)
      else {
        // "missing": the game has no static mesh for it (never retried). "error": left out of the index, so a later run retries it.
        if (ev.payload.status === 'missing') index.skipped.push(ev.payload.sid)
        else failed.push(ev.payload.sid)
        finished++
        store.setJob({ done: finished })
      }
      notify()
    })

    const exporting = invokeMeshes('export-meshes', gameDir, `${dir}meshes`, todo.map((o) => o.sid))
      .catch((e) => { if (!abort.signal.aborted) throw e })
      .finally(() => { exportDone = true; notify() })

    const fireSprite = async () => {
      try { return exactBuffer(await readFile(`${dir}meshes/fire_sprite.png`)) } catch { return undefined }
    }

    async function renderOne(sid: string) {
      const o = bySid.get(sid)!
      const meshDir = `${dir}meshes/${sid}/`
      const meta = JSON.parse(await readTextFile(`${meshDir}meta.json`)) as Parameters<typeof fileNames>[0] & {
        bbox_min: [number, number, number]
        bbox_max: [number, number, number]
      }
      const files: Record<string, ArrayBuffer> = {}
      for (const n of fileNames(meta)) files[n] = exactBuffer(await readFile(meshDir + n))
      const fire = sid === 'camp_fire' ? await fireSprite() : undefined
      let canvas = canvasForBounds(meta.bbox_min, meta.bbox_max)
      for (;;) {
        // The buffers are cloned into the worker, not transferred, so a retry at a bigger canvas can reuse them.
        const r = await pool!.render({ sid, files, fireSprite: fire, canvas, rot: o.rot, cutBelow: o.cut, noShadow: o.noShadow, elevation: o.job === 'cliffs' ? CLIFF_ELEVATION : o.job === 'rivers' ? RIVER_ELEVATION : undefined, azimuth: o.job === 'cliffs' || o.job === 'rivers' ? CLIFF_AZIMUTH : undefined, topMask: o.job === 'cliffs' })
        const next = CANVAS_STEPS.find((c) => c > canvas)
        if (r.clipped && next) { canvas = next; continue }
        if (r.empty) throw new Error('nothing visible')
        await writeFile(`${dir}renders/${sid}.png`, new Uint8Array(r.png))
        if (r.mask) await writeFile(`${dir}renders/${sid}_m.png`, new Uint8Array(r.mask))
        index.objects[sid] = { w: r.w, h: r.h, ox: Math.round(r.ox), oy: Math.round(r.oy), dx: o.offsetX, dz: o.offsetZ }
        return
      }
    }

    const lane = async () => {
      for (;;) {
        if (abort.signal.aborted) return
        const sid = ready.shift()
        if (!sid) {
          if (exportDone) return
          await new Promise<void>((resolve) => wakers.push(resolve))
          continue
        }
        store.setJob({ current: sid })
        try {
          await renderOne(sid)
          await remove(`${dir}meshes/${sid}`, { recursive: true }).catch(() => undefined)
        } catch (e) {
          if (abort.signal.aborted) return
          failed.push(sid)
          console.warn(`render ${sid} failed:`, e)
        }
        finished++
        store.setJob({ done: finished, phase: 'rendering' })
        if (++unsaved >= SAVE_EVERY) { unsaved = 0; await saveRenderIndex(structuredClone(index)) }
      }
    }
    const lanes = Array.from({ length: PARALLEL }, () => lane())
    await Promise.all([exporting, ...lanes])
    unlisten()
    await saveRenderIndex(structuredClone(index))
    if (abort.signal.aborted) store.setJob({ phase: 'cancelled' })
    else if (failed.length > 0 && failed.length === todo.length) store.setJob({ phase: 'error', error: 'No object could be rendered.' })
    else store.setJob({ phase: 'done', failed: failed.length })
  } catch (e) {
    if (abort.signal.aborted) store.setJob({ phase: 'cancelled' })
    else store.setJob({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
  } finally {
    pool?.terminate()
    running = null
    void refreshPendingCounts()
  }
}

/** Stop the running job. What is already rendered stays. */
export async function cancelRenderJob(): Promise<void> {
  running?.abort()
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('cancel_object_meshes').catch(() => undefined)
}

/** Run the jobs in order, skipping one that has nothing left to do. */
export async function runAllRenderJobs(): Promise<void> {
  for (const job of JOBS) {
    await runRenderJob(job)
    if (useObjectRenderStore.getState().job.phase !== 'done') return
  }
}
