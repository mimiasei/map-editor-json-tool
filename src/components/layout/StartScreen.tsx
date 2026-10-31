// ─── Start screen ────────────────────────────────────────────────────────────
// What the Map tab shows while no map is loaded (TSE starts on the Map tab). It reuses the Toolbar's own handlers by dispatching the
// same window events as the native menu, so the unsaved-changes checks and error dialogs stay in one place.

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dices, FilePlus, FolderOpen, Keyboard, Upload, X } from '@/components/ui/icons'
import { isTauri } from '@/lib/native-fs'
import { getRecentFiles, removeRecentFile, type RecentFile } from '@/lib/recent-files'
import { comboLabel } from '@/lib/hotkeys'
import { useHotkeyCombo } from '@/store/useHotkeyStore'

function fire(name: string, detail?: string) {
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }))
}

function ActionButton({ icon, label, combo, onClick }: { icon: ReactNode; label: string; combo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent/50"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1">{label}</span>
      {combo && <span className="text-xs font-normal text-muted-foreground">{comboLabel(combo)}</span>}
    </button>
  )
}

export default function StartScreen() {
  const { t } = useTranslation()
  const desktop = isTauri()
  const [version, setVersion] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentFile[]>(() => (desktop ? getRecentFiles() : []))
  const newMapCombo = useHotkeyCombo('newMap')
  const openMapCombo = useHotkeyCombo('openMap')
  const randomMapCombo = useHotkeyCombo('randomMap')
  const openScenarioCombo = useHotkeyCombo('openScenario')

  useEffect(() => {
    if (!desktop) return
    void import('@tauri-apps/api/app').then((m) => m.getVersion()).then(setVersion).catch(() => setVersion(null))
  }, [desktop])

  return (
    <div className="flex h-full items-start justify-center overflow-auto py-10">
      <div className="w-full max-w-xl space-y-6 px-4">
        <div>
          <h1 className="text-xl font-semibold">{t('startScreen.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('startScreen.subtitle')}
            {version ? ` · v${version}` : ''}
          </p>
        </div>

        <div className="space-y-2">
          {desktop && <ActionButton icon={<FilePlus className="h-4 w-4" />} label={t('layout.toolbar.newMap')} combo={newMapCombo} onClick={() => fire('oe:new-map')} />}
          <ActionButton
            icon={desktop ? <FolderOpen className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            label={desktop ? t('startScreen.openMap') : t('layout.toolbar.importMap')}
            combo={openMapCombo}
            onClick={() => fire('oe:open-map')}
          />
          <ActionButton icon={<Dices className="h-4 w-4" />} label={t('common.generateRandomMapDialog.generateRandomMap')} combo={randomMapCombo} onClick={() => fire('oe:random-map')} />
          {desktop && <ActionButton icon={<Upload className="h-4 w-4" />} label={t('startScreen.importH3')} combo="" onClick={() => fire('oe:import-h3m')} />}
          <ActionButton icon={<FolderOpen className="h-4 w-4" />} label={t('startScreen.openProject')} combo={openScenarioCombo} onClick={() => fire('oe:open')} />
        </div>

        {desktop && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('startScreen.recent')}</p>
            {recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('startScreen.noRecent')}</p>
            ) : (
              <div className="rounded-lg border border-border bg-card">
                {recent.slice(0, 8).map((f) => (
                  <div key={f.path} className="flex items-center border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => fire('oe:open-recent-file', f.path)}
                      title={f.path}
                      className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-accent/50"
                    >
                      <span className="block truncate text-sm">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{f.path}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mr-1 h-7 w-7 p-0"
                      title={t('startScreen.removeRecent')}
                      onClick={() => { removeRecentFile(f.path); setRecent(getRecentFiles()) }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => fire('oe:whats-new')}>
            {t('startScreen.whatsNew')}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => fire('oe:hotkeys')}>
            <Keyboard className="h-3.5 w-3.5" />
            {t('hotkeys.title')}
          </Button>
        </div>
      </div>
    </div>
  )
}
