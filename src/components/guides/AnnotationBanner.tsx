import { useGuideStore } from '@/store/useGuideStore'
import { Info, X } from 'lucide-react'

interface Props {
  /** JSON path of this node, e.g. "quests[0].subQuests[0].triggers[0]" */
  path: string
}

/**
 * Renders an info banner above a node when a matching template annotation exists.
 * Dismissible per-path, persisted via useGuideStore.
 */
export default function AnnotationBanner({ path }: Props) {
  const { templateAnnotations, dismissedAnnotations, dismissAnnotation } = useGuideStore()

  const text = templateAnnotations[path]
  if (!text) return null
  if (dismissedAnnotations.includes(path)) return null

  return (
    <div className="flex items-start gap-2 rounded-md bg-blue-950/40 border border-blue-700/30 px-3 py-2 text-xs text-blue-200 mb-2">
      <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={() => dismissAnnotation(path)}
        className="text-blue-400 hover:text-blue-200 transition-colors shrink-0"
        aria-label="Dismiss annotation"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
