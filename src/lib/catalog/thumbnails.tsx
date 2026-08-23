// ─── Thumbnail utilities ──────────────────────────────────────────────────────
// thumbnailPath() resolves an icon SID to a local asset:// URL when the PNG
// has been extracted by the sidecar (issue #62). Components call this
// synchronously; the manifest is pre-loaded at app startup.

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/native-fs'
import { isIconKnown } from '@/hooks/useThumbnailManifest'
import { assetLeafName, heroPortraitIcon } from '@/lib/catalog/icon-requests'
import type { CreatureStats } from '@/lib/catalog/types'

// Cached once per session — populated by warmThumbnailDir() at startup.
let _appLocalDataDir: string | null = null

/**
 * Pre-warm the appLocalDataDir cache so thumbnailPath() can work synchronously
 * during render. Call once at app startup (before catalog loads).
 */
export async function warmThumbnailDir(): Promise<void> {
  if (!isTauri()) return
  if (_appLocalDataDir !== null) return
  const { appLocalDataDir } = await import('@tauri-apps/api/path')
  // Normalise to forward slashes and guarantee a trailing separator
  _appLocalDataDir = (await appLocalDataDir()).replace(/\\/g, '/').replace(/\/?$/, '/')
}

/**
 * Resolves an icon SID to a local asset URL if thumbnails have been extracted.
 * Returns null if thumbnails are not yet available (always in the web build,
 * and in Tauri before the extractor has run or the manifest hasn't been loaded).
 *
 * This function is synchronous and safe to call during render.
 * Relies on warmThumbnailDir() and loadThumbnailManifest() being called first.
 */
export function thumbnailPath(iconId: string | undefined): string | null {
  if (!iconId) return null
  if (!isTauri()) return null
  if (!_appLocalDataDir) return null
  // Extracted PNGs are named after Unity's Texture2D.m_Name, which is the last path
  // segment. Catalog entity icons are already bare names (leaf() is a no-op for
  // them), but dialog avatars are full paths like
  // "icons/dialogue/dialogue_unit_peasant" — without this they never resolved.
  const lower = assetLeafName(iconId).toLowerCase()
  if (!isIconKnown(lower)) return null
  const filePath = `${_appLocalDataDir}thumbnails/${lower}.png`
  return convertFileSrc(filePath)
}

// ─── CatalogIcon ─────────────────────────────────────────────────────────────

interface CatalogIconProps {
  /** Icon SID from a catalog entry */
  iconId: string | undefined
  /** Display name used as the text fallback when no thumbnail is available */
  name: string
  /** Size in pixels. Square unless `height` is given. Defaults to 20. */
  size?: number
  /** Height override, for portraits that are taller than they are wide. */
  height?: number
  className?: string
  /** Resolved src override, when the caller already picked a variant. */
  src?: string | null
}

/**
 * Renders a thumbnail <img> when the PNG has been extracted (issue #62),
 * otherwise renders a compact text badge.
 *
 * All catalog-backed dropdowns use this component so that thumbnails appear
 * automatically once extracted — no UI changes needed at that point.
 */
export function CatalogIcon({
  iconId,
  name,
  size = 20,
  height,
  className,
  src: srcOverride,
}: CatalogIconProps) {
  const src = srcOverride !== undefined ? srcOverride : thumbnailPath(iconId)
  const h = height ?? size

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={h}
        className={className}
        draggable={false}
        style={{ objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }

  // Text fallback: first letter of name as a small badge
  return (
    <span
      className={`inline-flex items-center justify-center rounded text-[10px] font-semibold bg-muted text-muted-foreground ${className ?? ''}`}
      style={{ width: size, height: h, flexShrink: 0 }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ─── Hero portraits ───────────────────────────────────────────────────────────

/**
 * The portrait dialogs use as the speaker image.
 *
 * Every `icons/hero_large_portraits/*` avatar in the shipped dialogs resolves to a
 * hero's `<icon>_large`, so that variant is preferred. Falls back to the plain card
 * icon — needed both for the one hero with no large portrait
 * (hero_campaign_10_dragonfly_king) and for anyone who has not re-run extraction
 * since the large portraits were added to the request list.
 */
export function heroPortraitPath(icon: string | undefined): string | null {
  if (!icon) return null
  return thumbnailPath(heroPortraitIcon(icon)) ?? thumbnailPath(icon)
}

// ─── PortraitThumb ────────────────────────────────────────────────────────────

interface PortraitThumbProps {
  iconId: string | undefined
  name: string
  /** Rendered size of the thumbnail itself. */
  size?: number
  height?: number
  /** Longest edge of the hover preview. */
  previewSize?: number
  /** Resolve the image differently — heroes pass heroPortraitPath. */
  resolve?: (icon: string | undefined) => string | null
  className?: string
}

/**
 * A thumbnail that shows an enlarged copy on hover. Extracted from the Game
 * Database detail pane so the hero picker can reuse it rather than copying the
 * markup a third time.
 *
 * The preview is a Radix Tooltip rather than an absolutely-positioned div. It used to be
 * pinned below-right (`absolute left-0 top-full`), which put a ~280px image partly outside
 * the dialog and the window for tiles in the last two columns or rows. CSS cannot flip
 * based on available space, but Tooltip portals to the body and, with the default
 * `avoidCollisions`, flips to the opposite side when there is no room and shifts along the
 * align axis to stay on screen.
 */
export function PortraitThumb({
  iconId,
  name,
  size = 40,
  height,
  previewSize = 256,
  resolve = thumbnailPath,
  className,
}: PortraitThumbProps) {
  const src = resolve(iconId)
  const thumb = <CatalogIcon iconId={iconId} name={name} size={size} height={height} src={src} />

  if (!src) return <div className={`shrink-0 ${className ?? ''}`}>{thumb}</div>

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`shrink-0 ${className ?? ''}`}>{thumb}</div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        collisionPadding={12}
        className="p-1 border-border bg-background"
      >
        <img
          src={src}
          alt={name}
          className="block"
          style={{
            // Capped against the viewport as well as previewSize, so a small window cannot
            // be handed a preview bigger than itself.
            maxWidth: `min(${previewSize}px, 90vw)`,
            maxHeight: `min(${previewSize}px, 80vh)`,
            objectFit: 'contain',
          }}
        />
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Creature stats grid ──────────────────────────────────────────────────────
// Shared by the Game Database detail pane and the Map Grid Object Browser's
// unit-hover tooltip — kept here alongside CatalogIcon/PortraitThumb as this
// module's other shared catalog-display primitive.

const STAT_LABELS: { key: keyof CreatureStats; label: string }[] = [
  { key: 'hp',           label: 'HP' },
  { key: 'offence',      label: 'Attack' },
  { key: 'defence',      label: 'Defense' },
  { key: 'initiative',   label: 'Initiative' },
  { key: 'speed',        label: 'Speed' },
  { key: 'luck',         label: 'Luck' },
  { key: 'moral',        label: 'Morale' },
  { key: 'actionPoints', label: 'Actions' },
  { key: 'numCounters',  label: 'Counters' },
]

export function CreatureStatsSection({ stats }: { stats: CreatureStats }) {
  const visible = STAT_LABELS.filter(({ key }) => stats[key] !== undefined)
  const hasDamage = stats.damageMin !== undefined && stats.damageMax !== undefined
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stats</p>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {hasDamage && (
          <div className="flex justify-between bg-muted rounded px-2 py-0.5">
            <span className="text-muted-foreground">Damage</span>
            <span className="font-semibold tabular-nums">{stats.damageMin} – {stats.damageMax}</span>
          </div>
        )}
        {visible.map(({ key, label }) => (
          <div key={key} className="flex justify-between bg-muted rounded px-2 py-0.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{stats[key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
