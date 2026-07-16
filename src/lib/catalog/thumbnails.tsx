// ─── Thumbnail utilities ──────────────────────────────────────────────────────
// thumbnailPath() resolves an icon SID to a local asset:// URL when the PNG
// has been extracted by the sidecar (issue #62). Components call this
// synchronously; the manifest is pre-loaded at app startup.

import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/native-fs'
import { isIconKnown } from '@/hooks/useThumbnailManifest'

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
  const lower = iconId.toLowerCase()
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
  /** Size in pixels (renders as a square). Defaults to 20. */
  size?: number
  className?: string
}

/**
 * Renders a thumbnail <img> when the PNG has been extracted (issue #62),
 * otherwise renders a compact text badge.
 *
 * All catalog-backed dropdowns use this component so that thumbnails appear
 * automatically once extracted — no UI changes needed at that point.
 */
export function CatalogIcon({ iconId, name, size = 20, className }: CatalogIconProps) {
  const src = thumbnailPath(iconId)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain', flexShrink: 0 }}
      />
    )
  }

  // Text fallback: first letter of name as a small badge
  return (
    <span
      className={`inline-flex items-center justify-center rounded text-[10px] font-semibold bg-muted text-muted-foreground ${className ?? ''}`}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
