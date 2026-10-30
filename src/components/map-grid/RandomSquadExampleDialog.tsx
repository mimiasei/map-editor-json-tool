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
import { useTranslation } from 'react-i18next'
import { localName } from '@/lib/catalog/local-name'

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
  const { t } = useTranslation()
  const [roll, setRoll] = useState(0)
  // roll is only a re-roll trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const example = useMemo(() => (open ? rollExampleSquad(value, fraction, catalog) : null), [open, value, fraction, catalog, roll])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('mapGrid.randomSquadExampleDialog.exampleSquad')}</DialogTitle>
          <DialogDescription>{t('mapGrid.randomSquadExampleDialog.oneSquadThisRandomSquad')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('mapGrid.randomSquadExampleDialog.basedOnValue')}</span>
            <span className="font-semibold tabular-nums">{value}</span>
            <Badge variant="outline" className="text-xs">{randomSquadDifficultyLabel(value, ranges)}</Badge>
          </div>
          {example ? (
            <>
              <ul className="space-y-1.5 min-h-[8.25rem]">
                {example.units.map((u) => {
                  const creature = catalog?.creatures.find((c) => c.id === u.sid)
                  return (
                    <li key={u.sid} className="flex items-center gap-2 text-sm">
                      <CatalogIcon iconId={creature?.icon ?? u.sid} name={creature ? localName(catalog, 'creatures', creature) : u.sid} size={28} />
                      <span className="flex-1">{creature ? localName(catalog, 'creatures', creature) : u.sid}</span>
                      <span className="tabular-nums text-muted-foreground">{u.count} × {u.unitValue}</span>
                      <span className="w-14 text-right tabular-nums">{u.count * u.unitValue}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-muted-foreground min-h-[3.75rem]">
                {t(`mapGrid.randomSquadExampleDialog.${fraction === '' ? (example.nearest ? 'totalValueNoFactionNearest' : 'totalValueNoFaction') : example.nearest ? 'totalValueNearest' : 'totalValue'}`, { value: example.totalValue, fraction: example.fraction })}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground min-h-[12.75rem]">{t('mapGrid.randomSquadExampleDialog.noSquadTemplatesAreLoaded')}</p>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRoll((n) => n + 1)}>
              <Dices className="h-3.5 w-3.5 mr-1" /> {t('mapGrid.randomSquadExampleDialog.rollAgain')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
