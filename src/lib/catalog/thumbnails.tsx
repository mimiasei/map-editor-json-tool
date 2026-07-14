// ─── Thumbnail stubs (prepared for issue #62) ─────────────────────────────────
// These stubs prepare the thumbnail integration point.
// When issue #62 extracts PNGs to app data, thumbnails will appear automatically
// in all catalog dropdowns and detail views — with no further UI changes needed.

import { isTauri } from '@/lib/native-fs'

/**
 * Resolves an icon SID to a local asset URL if thumbnails have been extracted.
 * Returns null if thumbnails are not yet available (always in the web build,
 * and in Tauri before issue #62 runs the extractor).
 *
 * Callers should render a text fallback when this returns null.
 */
export function thumbnailPath(iconId: string | undefined): string | null {
  if (!iconId) return null
  if (!isTauri()) return null
  // TODO(#62): check AppLocalData/thumbnails/{iconId}.png and return asset:// URL
  // Implementation will look like:
  //   const path = await resolveResource(`thumbnails/${iconId}.png`)
  //   return `asset://localhost/${encodeURIComponent(path)}`
  return null
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
