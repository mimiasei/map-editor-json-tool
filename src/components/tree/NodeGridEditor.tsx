// ─── Node grid editor ──────────────────────────────────────────────────────────
// Visual, clickable stand-in for hand-editing a map object's `nodes` array (the
// per-tile footprint values from Core/DB/map/objects/*.json — 1 = the visual/
// building occupies this tile, 2 = an interaction cell, 0 = outside the
// footprint entirely). Built for CustomObjectEditorDialog's "Build from
// scratch" debug panel, where editing "1,2,2,2" by hand to move which corner
// the visual sits in is far less discoverable than clicking the cell directly.
//
// Clicking a cell sets the WHOLE grid to "2 everywhere except this cell, which
// becomes 1" — i.e. exactly one visual/building cell, matching every
// confirmed real single-tile interactable's shape (see CustomObjectEditorDialog's
// CORNER_1X1_PATTERNS comment). For a multi-tile visual's padded footprint
// (more than one `1`), clicking would collapse it to a single cell — the raw
// nodes text field alongside this grid remains the only way to author that.

import { cn } from '@/lib/utils'

interface NodeGridEditorProps {
  sizeX: number
  sizeZ: number
  nodes: number[]
  onChange: (nodes: number[]) => void
}

export default function NodeGridEditor({ sizeX, sizeZ, nodes, onChange }: NodeGridEditorProps) {
  const cellCount = Math.max(0, sizeX * sizeZ)

  const handleClick = (index: number) => {
    const next = new Array(cellCount).fill(2)
    next[index] = 1
    onChange(next)
  }

  if (cellCount === 0 || cellCount > 400) {
    return <p className="text-xs text-muted-foreground">Grid too large to render — edit the raw nodes field below.</p>
  }

  return (
    <div
      className="inline-grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${sizeX}, 1.75rem)` }}
    >
      {Array.from({ length: cellCount }).map((_, i) => {
        const v = nodes[i] ?? 2
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleClick(i)}
            title={`Node ${i} (${v}) — click to place the visual/building here`}
            className={cn(
              'h-7 w-7 shrink-0 rounded border text-[10px] font-mono flex items-center justify-center transition-colors',
              v === 1 && 'bg-red-900 border-red-950 text-white hover:bg-red-800',
              v === 2 && 'bg-green-600/80 border-green-700 text-white hover:bg-green-600',
              v !== 1 && v !== 2 && 'bg-muted border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}
