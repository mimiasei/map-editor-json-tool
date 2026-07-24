// ─── SetupDialog ──────────────────────────────────────────────────────────────
// Shown once on first launch to walk new users through loading game data and
// (optionally) extracting thumbnails.

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Database, ImageIcon, ChevronRight } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when user wants to jump straight to the thumbnail extractor. */
  onOpenThumbnailExtract?: () => void
}

export default function SetupDialog({ open, onOpenChange, onOpenThumbnailExtract }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('oe-setup-shown', '1')
    }
    onOpenChange(false)
  }

  const handleExtractThumbnails = () => {
    if (dontShowAgain) {
      localStorage.setItem('oe-setup-shown', '1')
    }
    onOpenChange(false)
    onOpenThumbnailExtract?.()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Welcome to the Map Editor</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">
            Follow these two steps to get the most out of the editor.
          </p>

          {/* Step 1 */}
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              1
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Database className="h-4 w-4 text-muted-foreground" />
                Load game data (Core.zip)
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Open <span className="font-medium text-foreground">More → Game Data</span> in the
                toolbar and select the <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Core.zip</span> file
                from your Heroes of Might and Magic: Olden Era installation.
                This gives the editor access to all heroes, creatures, artifacts,
                spells, and other game objects.
              </p>
              <p className="text-xs text-muted-foreground">
                Default location on Windows:{' '}
                <span className="font-mono bg-muted px-1 py-0.5 rounded">
                  C:\Program Files (x86)\Steam\steamapps\common\Heroes of Might and Magic Olden Era\HeroesOldenEra_Data\StreamingAssets\Core.zip
                </span>
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
              2
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Extract thumbnails{' '}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                After loading game data, open{' '}
                <span className="font-medium text-foreground">More → Extract Thumbnails</span> and
                point the extractor at your game installation folder.
                This extracts icon images directly from the game files so
                every dropdown in the editor shows the real in-game icon next
                to each item's name.
              </p>
              <p className="text-xs text-muted-foreground">
                Thumbnails are stored locally and only need to be extracted once.
                The editor works fine without them — icons just won't be shown.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="setup-dont-show"
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(!!v)}
            />
            <Label htmlFor="setup-dont-show" className="text-xs text-muted-foreground cursor-pointer">
              Don't show this again
            </Label>
          </div>

          <div className="flex gap-2">
            {onOpenThumbnailExtract && (
              <Button variant="secondary" size="sm" onClick={handleExtractThumbnails}>
                Extract thumbnails
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            <Button onClick={handleClose}>Okay</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
