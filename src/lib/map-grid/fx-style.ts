// How a visual effect (fog, light, fireflies: the catalog's `fxs` category) looks on the Map Grid: its image half see-through under a white
// sparkle that marks it as an effect. Tweak the look here. Used by RenderedObject.tsx and the catalog icons in MapGridDialog.tsx.
// Blending only works against what is painted behind in the same stacking context; an ancestor with its own opacity, filter or transform
// (or `isolation: isolate`) keeps the image from blending with the terrain below.

import type { CSSProperties } from 'react'

/** 0 (invisible) to 1. */
export const FX_IMAGE_OPACITY = 0.5
/** Any CSS mix-blend-mode: 'normal', 'screen' (brightens what is under it), 'plus-lighter' (light), 'overlay', 'soft-light', 'multiply', 'color-dodge'... */
export const FX_IMAGE_BLEND_MODE: CSSProperties['mixBlendMode'] = 'normal'
/** Any CSS filter on the image itself, applied before blending: 'none', 'brightness(1.4)', 'contrast(1.2)', 'saturate(0.6)', 'brightness(1.3) contrast(1.1)'... */
export const FX_IMAGE_FILTER = 'none'

/** 0 to 1; the sparkle is white. */
export const FX_SPARKLE_OPACITY = 1
/** Sparkle size as a share of the icon (tile) size. */
export const FX_SPARKLE_SIZE = 0.6
/** The dark outline keeps the white sparkle readable on light ground; 'none' removes it. */
export const FX_SPARKLE_FILTER = 'drop-shadow(0 0 1px rgba(0,0,0,0.8))'

export const FX_IMAGE_STYLE: CSSProperties = { opacity: FX_IMAGE_OPACITY, mixBlendMode: FX_IMAGE_BLEND_MODE, filter: FX_IMAGE_FILTER }
export const FX_SPARKLE_STYLE: CSSProperties = { opacity: FX_SPARKLE_OPACITY, filter: FX_SPARKLE_FILTER }
