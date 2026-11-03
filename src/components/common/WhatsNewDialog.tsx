// ─── What's new (Help > What's new) ───────────────────────────────────────────
// Shows the notes of the running release from src/data/release-notes.md. The same text goes into the `notes` field of the release's
// latest.json (that is what the update dialog shows), so update it in both places when cutting a release.
// Below it, the notes of earlier releases come from src/data/release-history.json (npm run release-history reads them from each release's latest.json).

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { openExternal } from '@/lib/native-fs'
import notesMarkdown from '@/data/release-notes.md?raw'
import releaseHistory from '@/data/release-history.json'
import { version as appVersion } from '../../../src-tauri/tauri.conf.json'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The notes open with a line meant for the GitHub release page ("Desktop release for ..."), which means nothing inside the app.
const notes = notesMarkdown.replace(/^Desktop release for[^\n]*\n+/, '')
// The running release is already shown above.
const earlier = (releaseHistory as { version: string; notes: string }[]).filter((r) => r.version !== appVersion)

// A plain <a> would navigate this webview away from the editor, so links go to the system browser.
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <button type="button" className="text-primary underline underline-offset-2" onClick={() => { if (href) void openExternal(href) }}>
      {children}
    </button>
  ),
}

export default function WhatsNewDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={620}
        defaultHeight={560}
        minWidth={460}
        minHeight={360}
        storageKey="whats-new"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
          <DialogTitle>{t('shared.whatsNew')}</DialogTitle>
        </DraggableDialogDragHandle>
        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 prose-sm max-w-none text-sm [&_a]:text-primary [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{notes}</ReactMarkdown>
            {earlier.length > 0 && (
              <>
                <h1 className="mt-6 mb-2 border-t border-border pt-4">{t('shared.earlierVersions')}</h1>
                {earlier.map((release) => (
                  <details key={release.version} className="my-1 rounded-md border border-border px-3 py-1.5">
                    <summary className="cursor-pointer text-sm font-semibold">{release.version}</summary>
                    <div className="pb-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{release.notes}</ReactMarkdown>
                    </div>
                  </details>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
        <div className="px-6 py-3 border-t border-border flex justify-end shrink-0">
          <Button size="sm" onClick={() => onOpenChange(false)}>{t('ui.close')}</Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
