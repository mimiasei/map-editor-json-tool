// ─── Start screen ────────────────────────────────────────────────────────────
// What the Map tab shows while no map is loaded (TSE starts on the Map tab). It reuses the Toolbar's own handlers by dispatching the
// same window events as the native menu, so the unsaved-changes checks and error dialogs stay in one place.

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Clock, Dices, FilePlus, FolderOpen, Keyboard, Upload, X } from '@/components/ui/icons'
import { isTauri } from '@/lib/native-fs'
import { getRecentFiles, removeRecentFile, type RecentFile } from '@/lib/recent-files'
import { cn } from '@/lib/utils'

function fire(name: string, detail?: string) {
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }))
}

// One big square cell: the icon does most of the talking, the label sits under it.
function Cell({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-card p-3 text-center transition-colors hover:bg-accent/50',
        active && 'bg-accent/50',
      )}
    >
      <span className="text-muted-foreground [&_svg]:h-14 [&_svg]:w-14">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

export default function StartScreen() {
  const { t } = useTranslation()
  const desktop = isTauri()
  const [version, setVersion] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentFile[]>(() => (desktop ? getRecentFiles() : []))
  const [recentOpen, setRecentOpen] = useState(false)

  useEffect(() => {
    if (!desktop) return
    void import('@tauri-apps/api/app').then((m) => m.getVersion()).then(setVersion).catch(() => setVersion(null))
  }, [desktop])

  return (
    <div className="flex h-full items-start justify-center overflow-auto py-10">
      <div className="w-full max-w-[864px] space-y-6 px-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex aspect-square flex-col justify-between p-3">
            <div className="flex flex-1 flex-col justify-center">
              <h1 className="text-sm font-medium text-foreground">{t('startScreen.title')}</h1>
              <div className="mt-3 flex flex-col gap-3 text-secondary dark:text-muted-foreground">
                <p className="text-[2rem] font-bold leading-tight">
                  {/* Languages that put a \n in the text get a second, right-aligned line. */}
                  {t('startScreen.subtitle').split('\n').map((line, i) => (
                    <span key={i} className={i === 0 ? 'block' : 'block text-right'}>{line}</span>
                  ))}
                </p>
                <p className="text-sm font-medium text-foreground">{version ? `v${version}` : ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="self-end bg-card hover:bg-accent/50" onClick={() => fire('oe:whats-new')}>
              {t('startScreen.whatsNew')}
            </Button>
          </div>
          {desktop && <Cell icon={<FilePlus />} label={t('layout.toolbar.newMap')} onClick={() => fire('oe:new-map')} />}
          <Cell
            icon={desktop ? <FolderOpen /> : <Upload />}
            label={desktop ? t('startScreen.openMap') : t('layout.toolbar.importMap')}
           
            onClick={() => fire('oe:open-map')}
          />
          <Cell icon={<Dices />} label={t('common.generateRandomMapDialog.generateRandomMap')} onClick={() => fire('oe:random-map')} />
          {desktop && <Cell icon={<Upload />} label={t('startScreen.importH3')} onClick={() => fire('oe:import-h3m')} />}
          {desktop && <Cell icon={<Clock />} label={t('startScreen.recent')} active={recentOpen} onClick={() => { setRecent(getRecentFiles()); setRecentOpen((v) => !v) }} />}
        </div>

        {desktop && recentOpen && (
          recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('startScreen.noRecent')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.slice(0, 3).map((f) => (
                <div key={f.path} className="flex items-center rounded-lg bg-card pl-4 pr-1.5 transition-colors hover:bg-accent/50">
                  <button
                    type="button"
                    onClick={() => fire('oe:open-recent-file', f.path)}
                    title={f.path}
                    className="min-w-0 flex-1 py-2 text-left"
                  >
                    <span className="block truncate text-sm">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{f.path}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 rounded-md p-0"
                    title={t('startScreen.removeRecent')}
                    onClick={() => { removeRecentFile(f.path); setRecent(getRecentFiles()) }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => fire('oe:hotkeys')}>
            <Keyboard className="h-3.5 w-3.5" />
            {t('hotkeys.title')}
          </Button>
        </div>
      </div>
    </div>
  )
}
