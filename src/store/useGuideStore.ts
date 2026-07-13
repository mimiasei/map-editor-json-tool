import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GuideStore {
  /** Whether the guides panel is open */
  panelOpen: boolean
  /** Currently displayed article ID, or null for the index */
  activeArticleId: string | null
  /** Annotation paths the user has dismissed this session + persisted across reloads */
  dismissedAnnotations: string[]
  /** Annotations loaded from the active template (_annotations map) */
  templateAnnotations: Record<string, string>

  openPanel(articleId?: string): void
  closePanel(): void
  togglePanel(): void
  navigateTo(articleId: string): void
  dismissAnnotation(path: string): void
  clearDismissedAnnotations(): void
}

export const useGuideStore = create<GuideStore>()(
  persist(
    (set) => ({
      panelOpen: false,
      activeArticleId: null,
      dismissedAnnotations: [],
      templateAnnotations: {},

      openPanel(articleId) {
        set({ panelOpen: true, ...(articleId ? { activeArticleId: articleId } : {}) })
      },

      closePanel() {
        set({ panelOpen: false })
      },

      togglePanel() {
        set((s) => ({ panelOpen: !s.panelOpen }))
      },

      navigateTo(articleId) {
        set({ activeArticleId: articleId, panelOpen: true })
      },

      dismissAnnotation(path) {
        set((s) => ({
          dismissedAnnotations: s.dismissedAnnotations.includes(path)
            ? s.dismissedAnnotations
            : [...s.dismissedAnnotations, path],
        }))
      },

      clearDismissedAnnotations() {
        set({ dismissedAnnotations: [] })
      },
    }),
    {
      name: 'oe-guide-store',
      // Only persist dismissedAnnotations and the panel open state
      partialize: (s) => ({
        dismissedAnnotations: s.dismissedAnnotations,
      }),
    },
  ),
)
