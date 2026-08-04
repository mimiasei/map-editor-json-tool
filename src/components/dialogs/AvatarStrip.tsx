// ─── Avatar strip ─────────────────────────────────────────────────────────────
// Dialog avatars are addressed by a `position` from 1 to 5, rendered left to
// right by the game. This editor mirrors that layout: five slots in a row, click
// an empty one to place an avatar there. 4584 of the 5468 shipped slides use
// avatars, so this is the most-used dialog feature the editor was missing.

import { useState } from 'react'
import type { DialogAvatar } from '@/types/dialog'
import { AVATAR_ANIMATIONS, AVATAR_POSITIONS } from '@/types/dialog'
import { useCatalogStore } from '@/store/useCatalogStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AssetCombobox from './AssetCombobox'
import { LayoutGrid, MessageSquare, Plus, Trash2, UserRound } from 'lucide-react'
import { thumbnailPath } from '@/lib/catalog/thumbnails'
import { heroAvatarIcon } from '@/lib/catalog/icon-requests'
import HeroPickerDialog from '@/components/catalog/HeroPickerDialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultAvatar(position: number): DialogAvatar {
  return { position, icon: '', isForeground: 'true' }
}

/** Last path segment, which is the readable part of an avatar icon path. */
function iconName(icon: string): string {
  return icon.split('/').pop() ?? icon
}

// ─── Single slot ──────────────────────────────────────────────────────────────

function Slot({
  position,
  avatar,
  selected,
  isSpeaker,
  onSelect,
  onAdd,
}: {
  position: number
  avatar: DialogAvatar | undefined
  selected: boolean
  /** True when the slide's speaker label is anchored to this position. */
  isSpeaker: boolean
  onSelect: () => void
  onAdd: () => void
}) {
  const occupied = !!avatar
  const portraitSrc = thumbnailPath(avatar?.icon)

  return (
    <button
      type="button"
      onClick={occupied ? onSelect : onAdd}
      title={occupied ? iconName(avatar!.icon) || `Position ${position}` : `Add avatar at position ${position}`}
      className={`flex-1 flex min-h-[76px] flex-col items-center justify-center gap-1 rounded border px-1 py-2 transition-colors ${
        selected
          ? 'border-primary bg-primary/10'
          : occupied
            ? 'border-border bg-card hover:bg-accent/50'
            : 'border-dashed border-border/60 text-muted-foreground hover:bg-accent/30'
      }`}
    >
      {occupied ? (
        // The actual portrait once extracted; the glyph is only a fallback. Dimmed
        // for background-layer avatars so the strip reflects the layering.
        portraitSrc ? (
          <img
            src={portraitSrc}
            alt={iconName(avatar!.icon)}
            className={avatar!.isForeground === 'true' ? '' : 'opacity-60'}
            width={40}
            height={40}
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <UserRound
            className={`h-4 w-4 ${avatar!.isForeground === 'true' ? 'text-primary' : 'text-muted-foreground opacity-60'}`}
          />
        )
      ) : (
        <Plus className="h-3 w-3 opacity-50" />
      )}
      <span className="flex items-center gap-0.5 text-[10px] leading-none">
        {position}
        {isSpeaker && <MessageSquare className="h-2.5 w-2.5 text-primary" />}
      </span>
      {occupied && (
        <span className="w-full truncate text-[9px] leading-tight text-muted-foreground">
          {iconName(avatar!.icon) || '(no icon)'}
        </span>
      )}
    </button>
  )
}

// ─── Strip ────────────────────────────────────────────────────────────────────

interface Props {
  avatars: DialogAvatar[]
  onChange: (avatars: DialogAvatar[]) => void
  /** Position the slide's speaker label is anchored to (title.position). */
  speakerPosition?: number
  /** Point the speaker label at a position. Omit to hide the control. */
  onSpeakerPositionChange?: (position: number) => void
}

export default function AvatarStrip({
  avatars,
  onChange,
  speakerPosition,
  onSpeakerPositionChange,
}: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const iconSuggestions = (catalog?.dialogAvatarIcons ?? []).map((v) => ({ value: v }))

  // The avatar path is built from the hero's `icon`, and only the real catalog has it:
  // STATIC_HEROES fills `icon` with the SID as a stand-in, and no SID is a real icon
  // name, so picking from the fallback list would write a path that resolves to nothing.
  // Better to say why the button is unavailable than to write a broken portrait.
  const heroesLoaded = (catalog?.heroes?.length ?? 0) > 0

  const [selectedPos, setSelectedPos] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const byPosition = new Map<number, DialogAvatar>()
  for (const a of avatars) byPosition.set(a.position, a)

  const selected = selectedPos !== null ? byPosition.get(selectedPos) : undefined

  const addAt = (position: number) => {
    onChange([...avatars, defaultAvatar(position)].sort((a, b) => a.position - b.position))
    setSelectedPos(position)
  }

  const patchSelected = (patch: Partial<DialogAvatar>) => {
    if (selectedPos === null) return
    onChange(avatars.map((a) => (a.position === selectedPos ? { ...a, ...patch } : a)))
  }

  const removeSelected = () => {
    if (selectedPos === null) return
    onChange(avatars.filter((a) => a.position !== selectedPos))
    setSelectedPos(null)
  }

  const toggleAnimation = (anim: string) => {
    if (!selected) return
    const current = selected.animations ?? []
    const next = current.includes(anim) ? current.filter((a) => a !== anim) : [...current, anim]
    patchSelected({ animations: next.length > 0 ? next : undefined })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {AVATAR_POSITIONS.map((position) => (
          <Slot
            key={position}
            position={position}
            avatar={byPosition.get(position)}
            selected={selectedPos === position}
            isSpeaker={speakerPosition === position}
            onSelect={() => setSelectedPos(selectedPos === position ? null : position)}
            onAdd={() => addAt(position)}
          />
        ))}
      </div>

      {selected && (
        <div className="space-y-2 rounded border border-border bg-background p-2">
          <div className="flex items-center gap-2">
            {thumbnailPath(selected.icon) && (
              <img
                src={thumbnailPath(selected.icon)!}
                alt={iconName(selected.icon)}
                width={44}
                height={44}
                className="rounded border border-border bg-card"
                style={{ objectFit: 'contain' }}
              />
            )}
            <span className="text-xs font-medium">Position {selected.position}</span>
            {speakerPosition === selected.position ? (
              <span className="flex items-center gap-1 text-[10px] text-primary">
                <MessageSquare className="h-2.5 w-2.5" /> speaking
              </span>
            ) : (
              onSpeakerPositionChange && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs text-muted-foreground"
                  onClick={() => onSpeakerPositionChange(selected.position)}
                  title="Anchor the speaker label to this avatar"
                >
                  <MessageSquare className="h-3 w-3" /> Make speaker
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={removeSelected}
            >
              <Trash2 className="h-3 w-3" /> Remove
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Icon</Label>
            {/* A realistic-looking path as placeholder made an empty avatar read as
                configured — the slot said "(no icon)" while the field appeared filled. */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <AssetCombobox
                  value={selected.icon}
                  onChange={(icon) => patchSelected({ icon })}
                  suggestions={iconSuggestions}
                  placeholder="Pick an avatar portrait…"
                  emptyHint="No avatar icons — load Core.zip via Game Data"
                  thumbnailFor={thumbnailPath}
                />
              </div>
              {/* Named, always-visible, and outside the input. The hero browser used to
                  be reachable only from a row inside a *different* combobox, which this
                  panel never renders — so from the Dialog Editor there was no way in at
                  all. The dropdown above still covers unit and NPC portraits, which the
                  hero browser does not list. */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                onClick={() => setPickerOpen(true)}
                disabled={!heroesLoaded}
                title={
                  heroesLoaded
                    ? 'Browse hero portraits grouped by faction'
                    : 'Load Core.zip via Game Data to browse hero portraits'
                }
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Heroes…
              </Button>
            </div>
            {!selected.icon && (
              <p className="text-[10px] text-amber-600">
                No portrait chosen yet — this avatar will not appear in game.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Layer</Label>
              <div className="flex items-center gap-3 h-7 text-xs">
                {(['true', 'false'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={selected.isForeground === v}
                      onChange={() => patchSelected({ isForeground: v })}
                      className="accent-primary"
                    />
                    {v === 'true' ? 'Foreground' : 'Background'}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Width (optional)</Label>
              <Input
                value={selected.width ?? ''}
                onChange={(e) => patchSelected({ width: e.target.value || undefined })}
                placeholder="292"
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Animations</Label>
            <div className="flex items-center gap-3 text-xs">
              {AVATAR_ANIMATIONS.map((anim) => (
                <label key={anim} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(selected.animations ?? []).includes(anim)}
                    onChange={() => toggleAnimation(anim)}
                    className="accent-primary"
                  />
                  {anim}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <HeroPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose a hero portrait"
        onSelect={(_id, hero) => patchSelected({ icon: heroAvatarIcon(hero.icon) })}
      />
    </div>
  )
}
