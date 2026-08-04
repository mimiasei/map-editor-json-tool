// ─── Non-blocking notice banners ──────────────────────────────────────────────
// Strips shown under the toolbar for things the user should know but must not be
// interrupted by. Styling follows AnnotationBanner.

import { Download, ImageIcon, Info, X } from 'lucide-react'

interface UpdateBannerProps {
  version: string
  onOpen: () => void
  onDismiss: () => void
}

/**
 * "Version X available" strip. Dismissal is held in AppShell state, so it comes
 * back on the next launch while the update is still newer — the behaviour issue
 * #51 asks for.
 */
export function UpdateBanner({ version, onOpen, onDismiss }: UpdateBannerProps) {
  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-700/30 dark:bg-blue-950/40 dark:text-blue-200">
      <Download className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
      <span className="flex-1">
        Version <span className="font-mono font-semibold">{version}</span> is available.
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
      >
        What's new
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-blue-500 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
        aria-label="Dismiss update notice"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface RestoreBannerProps {
  fileName: string | null
  wasDirty: boolean
  onDismiss: () => void
}

/**
 * Shown once after an update restored the previous session. Restoring unsaved work
 * silently would be worse than saying so — the user needs to know the editor is
 * holding changes they never saved.
 */
export function RestoreBanner({ fileName, wasDirty, onDismiss }: RestoreBannerProps) {
  return (
    <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-700/30 dark:bg-green-950/40 dark:text-green-200">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
      <span className="flex-1">
        Restored {fileName ? <span className="font-mono">{fileName}</span> : 'your work'} from
        before the update.
        {wasDirty && ' It still has unsaved changes.'}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-green-600 transition-colors hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
        aria-label="Dismiss restore notice"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface ThumbnailsBannerProps {
  /** How many requested icons the last extraction never asked for. */
  count: number
  onExtract: () => void
  onDismiss: () => void
}

/**
 * Shown when the app now wants artwork the last extraction did not fetch — which is
 * what happens whenever a release teaches the extractor about new icons. Without this
 * the only symptom is silently missing portraits.
 */
export function ThumbnailsBanner({ count, onExtract, onDismiss }: ThumbnailsBannerProps) {
  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/30 dark:bg-amber-950/40 dark:text-amber-200">
      <ImageIcon className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1">
        {count} new game {count === 1 ? 'image is' : 'images are'} available — re-run the
        extractor to see {count === 1 ? 'it' : 'them'} in dropdowns, the hero picker and dialog
        avatars.
      </span>
      <button
        type="button"
        onClick={onExtract}
        className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
      >
        Extract now
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-600 transition-colors hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
        aria-label="Dismiss artwork notice"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
