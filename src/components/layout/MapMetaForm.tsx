import { useScenarioStore } from '@/store/useScenarioStore'
import { useTranslation, Trans } from 'react-i18next'

export default function MapMetaForm() {
  const { t } = useTranslation()
  const { mapName } = useScenarioStore()

  const sidPrefix = mapName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

  return (
    <div className="p-4 space-y-4 text-sm text-muted-foreground">
      <p>
        {t('layout.mapMetaForm.selectAnItemInThe')}
      </p>
      {sidPrefix ? (
        <p>
          {t('layout.mapMetaForm.suggestedSidPrefix')}{' '}
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{sidPrefix}_</code>
        </p>
      ) : (
        <p className="border border-border rounded p-2 bg-muted/30 text-xs">
          <Trans i18nKey="layout.mapMetaForm.enterMapName" components={{ b: <strong /> }} />
        </p>
      )}
    </div>
  )
}
