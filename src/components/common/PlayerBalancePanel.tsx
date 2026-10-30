import type { PlayerBalance, BalanceDimension } from '@/lib/map-grid/player-balance'
import type { DecorationBalance } from '@/lib/map-grid/decoration-balance'
import { useTranslation, Trans } from 'react-i18next'

/** Player balance table + score (issue #255) — shared by the Stats panel and
 *  the Generate Random Map result step so both show the same numbers. */
const VERDICT_CLASS: Record<PlayerBalance['verdict'], string> = {
  Excellent: 'text-emerald-600 dark:text-emerald-400',
  Good: 'text-emerald-600 dark:text-emerald-400',
  Uneven: 'text-amber-600 dark:text-amber-400',
  Unfair: 'text-red-600 dark:text-red-400',
}

export default function PlayerBalancePanel({ balance }: { balance: PlayerBalance | null }) {
  const { t } = useTranslation()
  if (!balance) {
    return <p className="text-xs text-muted-foreground">{t('common.playerBalancePanel.needsAtLeastTwoPlayer')}</p>
  }
  const cell = (flagged: boolean) => `py-1 text-right ${flagged ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`
  const flagged = (flags: Set<BalanceDimension>, d: BalanceDimension) => flags.has(d)
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <Trans
          i18nKey="common.playerBalancePanel.fairness"
          values={{ score: balance.score, verdict: t(`validate.balance.verdicts.${balance.verdict}`) }}
          components={{ b: <span className="font-semibold" />, v: <span className={`font-medium ${VERDICT_CLASS[balance.verdict]}`} /> }}
        />
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="pb-1 text-left font-medium">{t('shared.player')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.dryTilesInThePlayers')}>{t('common.playerBalancePanel.land')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.minesInTheZoneAnd')}>{t('shared.mines')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.shareOfTheZoneThat')}>{t('common.playerBalancePanel.hills')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.minesDwellingsResourcesInteractablesAnd')}>{t('common.playerBalancePanel.sites')}</th>
          </tr>
        </thead>
        <tbody>
          {balance.rows.map((r) => (
            <tr key={r.zoneId} className="border-b border-border/50">
              <td className="py-1">{t('shared.player2', { owner: r.owner })} <span className="text-muted-foreground">{r.faction}</span></td>
              <td className={cell(flagged(r.flags, 'land'))}>{r.landTiles}</td>
              <td className={cell(flagged(r.flags, 'mines'))}>{t('common.playerBalancePanel.mineSummary', { mines: r.mineCount, distance: r.meanMineDistance.toFixed(0) })}</td>
              <td className={cell(flagged(r.flags, 'terrain'))}>{Math.round(r.elevatedPct)}%</td>
              <td className={cell(flagged(r.flags, 'sites'))}>{r.siteCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {balance.problems.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('common.playerBalancePanel.notCompared')}</p>
          <ul className="text-xs list-disc pl-4 space-y-0.5">
            {balance.problems.map((text) => <li key={text}>{text}</li>)}
          </ul>
        </div>
      )}
      {balance.reasons.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4">
          {balance.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      {balance.recommendations.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold">{t('common.playerBalancePanel.recommendations')}</p>
          <ul className="text-xs list-disc pl-4 space-y-0.5">
            {balance.recommendations.map((text) => <li key={text}>{text}</li>)}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('common.playerBalancePanel.nothingStandsOutNoPlayer')}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t('common.playerBalancePanel.comparesEachPlayersOwnZone')}
      </p>
    </div>
  )
}

/** Decorations per player area (Fairness dialog only; not part of the score). */
export function DecorationBalanceSection({ decoration }: { decoration: DecorationBalance | null }) {
  const { t } = useTranslation()
  if (!decoration) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">{t('common.playerBalancePanel.decorations')}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="pb-1 text-left font-medium">{t('shared.player')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.mountainsTreesRocksAndOther')}>{t('common.playerBalancePanel.count')}</th>
            <th className="pb-1 text-right font-medium" title={t('common.playerBalancePanel.shareOfTheAreasDry')}>{t('common.playerBalancePanel.blocked')}</th>
          </tr>
        </thead>
        <tbody>
          {decoration.rows.map((r) => {
            const tone = r.flagged ? 'text-amber-600 dark:text-amber-400 font-medium' : ''
            return (
              <tr key={r.zoneId} className="border-b border-border/50">
                <td className="py-1">{t('shared.player2', { owner: r.owner })}</td>
                <td className={`py-1 text-right ${tone}`}>{r.decorationCount}</td>
                <td className={`py-1 text-right ${tone}`}>{t('common.playerBalancePanel.blockedSummary', { percent: Math.round(r.blockedPct), tiles: r.blockedTiles })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {decoration.notes.length > 0 ? (
        <ul className="text-xs list-disc pl-4 space-y-0.5">
          {decoration.notes.map((text) => <li key={text}>{text}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('common.playerBalancePanel.decorationsAreAboutEvenBetween')}</p>
      )}
    </div>
  )
}
