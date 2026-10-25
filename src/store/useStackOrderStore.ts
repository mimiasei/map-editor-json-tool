// A tile's manual stacking order (keys of its objects, top first). Editor-only: the `.map` has no drawing order, see stack-order.ts.
// Session state, cleared when another map is loaded.

import { create } from 'zustand'

interface StackOrderStore {
  byNode: Record<number, string[]>
  /** Objects with an id at or above this were placed in this session (the loaded map's `objectsFreeId`); Infinity until a map is loaded. */
  sessionFromId: number
  setOrder: (node: number, keys: string[]) => void
  /** Called when a map is loaded: forgets the manual orders and marks every object already in it as not placed this session. */
  reset: (sessionFromId: number) => void
}

export const useStackOrderStore = create<StackOrderStore>()((set) => ({
  byNode: {},
  sessionFromId: Infinity,
  setOrder: (node, keys) => set((s) => ({ byNode: { ...s.byNode, [node]: keys } })),
  reset: (sessionFromId) => set({ byNode: {}, sessionFromId }),
}))
