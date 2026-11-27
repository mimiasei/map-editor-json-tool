import { useEffect, useMemo, useRef } from 'react'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { readMapSettings } from '@/lib/map-write'

/** The project prefix (the scenario's `mapName`: publish zip name and sid prefix) starts as the map's title from Map settings, else the saved
 *  file's name, else mymap_yyyy_mm_dd. It keeps following those until the user types their own.
 *  Mounted in AppShell, not in the scenario tree: the tree only exists in quest mode, so after an import the validator saw an empty name
 *  ("Map name is empty") until the user switched to quest mode and back. */
export function useSuggestedMapPrefix(): void {
  const mapName = useScenarioStore((s) => s.mapName)
  const mapTitle = useMapDocumentStore((s) => (s.container ? readMapSettings(s.container.chunks[0], s.container.chunks[1]).title : ''))
  const currentFileName = useScenarioStore((s) => s.currentFileName)
  const suggestedPrefix = useMemo(() => {
    const title = mapTitle?.trim()
    if (title) return title
    const file = currentFileName?.replace(/.[^.]+$/, '').trim()
    if (file) return file
    const d = new Date()
    return `mymap_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`
  }, [mapTitle, currentFileName])
  const autoPrefixRef = useRef('')
  useEffect(() => {
    if (mapName !== '' && mapName !== autoPrefixRef.current) return
    if (mapName === suggestedPrefix) return
    autoPrefixRef.current = suggestedPrefix
    // Not setMapName: filling in the suggestion is not a user edit and must not mark the project dirty.
    useScenarioStore.setState({ mapName: suggestedPrefix })
  }, [mapName, suggestedPrefix])
}
