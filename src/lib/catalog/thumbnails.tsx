// ─── Thumbnail utilities ──────────────────────────────────────────────────────
// thumbnailPath() resolves an icon SID to a local asset:// URL when the PNG
// has been extracted by the sidecar (issue #62). Components call this
// synchronously; the manifest is pre-loaded at app startup.

import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/native-fs'
import { isIconKnown } from '@/hooks/useThumbnailManifest'
import { assetLeafName, heroPortraitIcon } from '@/lib/catalog/icon-requests'

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

  return (
    <div className={`relative group/thumb shrink-0 ${className ?? ''}`}>
      <CatalogIcon iconId={iconId} name={name} size={size} height={height} src={src} />
      {src && (
        <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover/thumb:block pointer-events-none">
          <div className="rounded-md border border-border bg-background shadow-lg p-1">
            <img
              src={src}
              alt={name}
              className="block"
              style={{ maxWidth: previewSize, maxHeight: previewSize, objectFit: 'contain' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
