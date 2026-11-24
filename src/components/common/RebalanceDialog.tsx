import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { RebalanceSuggestion } from '@/lib/map-grid/player-rebalance'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestions: RebalanceSuggestion[]
  /** Called with the ticked suggestions when the user presses Rebalance. */
  onRebalance: (chosen: RebalanceSuggestion[]) => void
}

/** The rebalance report: every suggested change with a tick box, all ticked to begin with. The X, Cancel and Esc close it without
 *  changing anything; a click outside does not close it, so a ticked list is not lost by accident. */
export default function RebalanceDialog({ open, onOpenChange, suggestions, onRebalance }: Props) {
  const { t } = useTranslation()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (open) setTicked(new Set(suggestions.map((s) => s.id)))
  }, [open, suggestions])

  const toggle = (id: string, on: boolean) => setTicked((prev) => {
    const next = new Set(prev)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  const chosen = suggestions.filter((s) => ticked.has(s.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('common.rebalanceDialog.title')}</DialogTitle>
          <DialogDescription>{t('common.rebalanceDialog.intro')}</DialogDescription>
        </DialogHeader>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common.rebalanceDialog.nothing')}</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {suggestions.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded border border-border/60 p-2 text-sm hover:bg-accent/40">
                  <Checkbox className="mt-0.5" checked={ticked.has(s.id)} onCheckedChange={(on) => toggle(s.id, on === true)} />
                  <span>{s.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('common.rebalanceDialog.note')}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" data-skin-large onClick={() => onOpenChange(false)}>
            {t('shared.cancel')}
          </Button>
          <Button type="button" data-skin-large disabled={chosen.length === 0} onClick={() => onRebalance(chosen)}>
            {t('common.rebalanceDialog.rebalance')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
