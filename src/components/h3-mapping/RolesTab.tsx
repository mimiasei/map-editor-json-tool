// The scenery role table (`sceneryRoleSids` in h3-object-mapping.json): which OE object each scenery role (tree, mountain, pool...) uses on each OE biome.
// Rows that convert an H3 object to a "scenery role" read from here; the varied trees and ranges widen each sid to its biome's whole set.

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Undo2 } from '@/components/ui/icons'
import EntityCombobox from '@/components/common/EntityCombobox'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import { SCENERY_ROLE_SIDS } from '@/lib/h3-import/h3-object-mapping'
import { OE_BIOMES, SCENERY_ROLES } from '@/lib/h3-import/h3-object-mapping-schema'

export default function RolesTab() {
  const { t } = useTranslation()
  const edited = useH3MappingStore((s) => s.edits.sceneryRoleSids)
  const setRoleSid = useH3MappingStore((s) => s.setRoleSid)
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
      <p className="mb-3 max-w-3xl text-muted-foreground">{t('h3Mapping.roles.intro')}</p>
      <table className="border-collapse">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">{t('h3Mapping.roles.role')}</th>
            {OE_BIOMES.map((biome) => <th key={biome} className="px-2 py-1.5 font-medium">{biome}</th>)}
          </tr>
        </thead>
        <tbody>
          {SCENERY_ROLES.map((role) => (
            <tr key={role} className="border-t border-border/60 align-top">
              <td className="px-2 py-1.5 font-mono">{role}</td>
              {OE_BIOMES.map((biome) => {
                const changed = edited[role]?.[biome]
                return (
                  <td key={biome} className="w-44 px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <div className="min-w-0 flex-1">
                        <EntityCombobox
                          value={changed ?? SCENERY_ROLE_SIDS[role]?.[biome] ?? ''}
                          category="mapObject"
                          placeholder="-"
                          onChange={(sid) => {
                            const clean = sid.trim()
                            setRoleSid(role, biome, clean && clean !== SCENERY_ROLE_SIDS[role]?.[biome] ? clean : null)
                          }}
                        />
                      </div>
                      {changed !== undefined && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setRoleSid(role, biome, null)} title={t('h3Mapping.roles.resetCell', { sid: SCENERY_ROLE_SIDS[role]?.[biome] ?? '' })}>
                          <Undo2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>
    </div>
  )
}
