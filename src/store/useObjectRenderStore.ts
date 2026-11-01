// ─── Object render store ─────────────────────────────────────────────────────
// What has been rendered (the index, read from app data) and the state of the running render job, so the Map Grid can
// show new images as they appear and the progress bar at the bottom of the window can follow the job.

import { create } from 'zustand'

/** One rendered object. Sizes and offsets are in px of the 256-px-per-tile render. */
export interface RenderEntry {
  /** Cropped image size. */
  w: number
  h: number
  /** Where the prefab's origin (its ground point) lies in the cropped image. */
  ox: number
  oy: number
  /** The template's offsetX/offsetZ: how far the origin lies from the centre of the anchor tile, in tiles (x right, z toward the bottom of the screen). */
  dx: number
  dz: number
}

/** The lookup table of what exists, so only new objects are exported and rendered later. */
export interface RenderIndex {
  version: 1
  /** Which DECORATIONS_REV the decoration renders were made with; a different (or missing) value drops them so they are rendered again. */
  decorationsRev?: number
  objects: Record<string, RenderEntry>
  /** Animation variants that reuse another object's render (chicken_2 -> chicken_1). */
  aliases: Record<string, string>
  /** Objects the game has no static mesh for (portals, pocket dimension): never retried, they keep their icon. */
  skipped: string[]
}

export type JobName = 'interactables' | 'decorations' | 'cliffs' | 'rivers'
export type JobPhase = 'idle' | 'preparing' | 'exporting' | 'rendering' | 'done' | 'error' | 'cancelled'

export interface JobState {
  phase: JobPhase
  job: JobName | null
  done: number
  total: number
  current: string
  error: string
  /** Objects of the finished job that could not be rendered. */
  failed: number
}

/** How many objects of each job still lack a render; null until the object list has been read. */
export type PendingCounts = Record<JobName, number>

interface ObjectRenderStore {
  index: RenderIndex | null
  job: JobState
  pending: PendingCounts | null
  setIndex: (index: RenderIndex) => void
  setJob: (patch: Partial<JobState>) => void
  setPending: (pending: PendingCounts | null) => void
}

export const IDLE_JOB: JobState = { phase: 'idle', job: null, done: 0, total: 0, current: '', error: '', failed: 0 }

export const useObjectRenderStore = create<ObjectRenderStore>((set) => ({
  index: null,
  job: IDLE_JOB,
  pending: null,
  setIndex: (index) => set({ index }),
  setJob: (patch) => set((s) => ({ job: { ...s.job, ...patch } })),
  setPending: (pending) => set({ pending }),
}))
