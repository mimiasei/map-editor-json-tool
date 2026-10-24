// A tile's manual stacking order (keys of its objects, top first). Editor-only: the `.map` has no drawing order, see stack-order.ts.
// Session state, cleared when another map is loaded.

import { create } from 'zustand'

interface StackOrderStore {
  byNode: Record<number, string[]>
  setOrder: (node: number, keys: string[]) => void
  clear: () => void
}

export const useStackOrderStore = create<StackOrderStore>()((set) => ({
  byNode: {},
  setOrder: (node, keys) => set((s) => ({ byNode: { ...s.byNode, [node]: keys } })),
  clear: () => set({ byNode: {} }),
}))
