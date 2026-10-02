import type { PlayerBalance, BalanceDimension } from '@/lib/map-grid/player-balance'

/** Player balance table + score (issue #255) — shared by the Stats panel and
 *  the Generate Random Map result step so both show the same numbers. */
const VERDICT_CLASS: Record<PlayerBalance['verdict'], string> = {
  Excellent: 'text-emerald-600 dark:text-emerald-400',
  Good: 'text-emerald-600 dark:text-emerald-400',
  Uneven: 'text-amber-600 dark:text-amber-400',
  Unfair: 'text-red-600 dark:text-red-400',
}

export default function PlayerBalancePanel({ balance }: { balance: PlayerBalance | null }) {
  if (!balance) {
    return <p className="text-xs text-muted-foreground">Needs at least two player areas painted on the map (a randomly generated map has them) to compare players.</p>
  }
  const cell = (flagged: boolean) => `py-1 text-right ${flagged ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`
  const flagged = (flags: Set<BalanceDimension>, d: BalanceDimension) => flags.has(d)
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Fairness <span className="font-semibold">{balance.score}/100</span>{' '}
        <span className={`font-medium ${VERDICT_CLASS[balance.verdict]}`}>{balance.verdict}</span>
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="pb-1 text-left font-medium">Player</th>
            <th className="pb-1 text-right font-medium" title="Dry tiles in the player's own zone">Land</th>
            <th className="pb-1 text-right font-medium" title="Mines in the zone, and their average distance from the start">Mines</th>
            <th className="pb-1 text-right font-medium" title="Share of the zone that is hills or valleys">Hills</th>
            <th className="pb-1 text-right font-medium" title="Mines, dwellings, resources, interactables and artifacts in the zone">Sites</th>
          </tr>
        </thead>
        <tbody>
          {balance.rows.map((r) => (
            <tr key={r.zoneId} className="border-b border-border/50">
              <td className="py-1">Player {r.owner} <span className="text-muted-foreground">{r.faction}</span></td>
              <td className={cell(flagged(r.flags, 'land'))}>{r.landTiles}</td>
              <td className={cell(flagged(r.flags, 'mines'))}>{r.mineCount} · {r.meanMineDistance.toFixed(0)} tiles</td>
              <td className={cell(flagged(r.flags, 'terrain'))}>{Math.round(r.elevatedPct)}%</td>
              <td className={cell(flagged(r.flags, 'sites'))}>{r.siteCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {balance.reasons.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4">
          {balance.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Compares each player&apos;s own zone only — highlighted cells are over 10% off the group median. Guard strength and the neutral zones around each player are not compared.
      </p>
    </div>
  )
}
