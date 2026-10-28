// ─── Random-squad example (Map Grid object info) ─────────────────────────────
// A read-only preview of what a random-squad with the given army value could turn into. See rollExampleSquad for how close that is to the game.

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { Dices } from '@/components/ui/icons'
import { rollExampleSquad, randomSquadDifficultyLabel, type DifficultyRange } from '@/lib/map-grid/squad-pool'
import type { GameCatalog } from '@/lib/catalog/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The random-squad's army value, the figure the example is built from. */
  value: number
  fraction: string
  catalog: GameCatalog | null
  ranges: DifficultyRange[]
}

export default function RandomSquadExampleDialog({ open, onOpenChange, value, fraction, catalog, ranges }: Props) {
  const [roll, setRoll] = useState(0)
  // roll is only a re-roll trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const example = useMemo(() => (open ? rollExampleSquad(value, fraction, catalog) : null), [open, value, fraction, catalog, roll])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Example squad</DialogTitle>
          <DialogDescription>One squad this random-squad could turn into. It is an approximation of the game&apos;s own roll.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Based on value</span>
            <span className="font-semibold tabular-nums">{value}</span>
            <Badge variant="outline" className="text-xs">{randomSquadDifficultyLabel(value, ranges)}</Badge>
          </div>
          {example ? (
            <>
              <ul className="space-y-1.5">
                {example.units.map((u) => {
                  const creature = catalog?.creatures.find((c) => c.id === u.sid)
                  return (
                    <li key={u.sid} className="flex items-center gap-2 text-sm">
                      <CatalogIcon iconId={creature?.icon ?? u.sid} name={creature?.name ?? u.sid} size={28} />
                      <span className="flex-1">{creature?.name ?? u.sid}</span>
                      <span className="tabular-nums text-muted-foreground">{u.count} × {u.unitValue}</span>
                      <span className="w-14 text-right tabular-nums">{u.count * u.unitValue}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-muted-foreground">
                Total value {example.totalValue} · {example.fraction}{fraction ? '' : ' (no faction set: picked at random)'}
                {example.nearest && ' · no squad template covers this value, the nearest one is shown'}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No squad templates are loaded, so there is nothing to show. Extract the game data first.</p>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRoll((n) => n + 1)}>
              <Dices className="h-3.5 w-3.5 mr-1" /> Roll again
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
