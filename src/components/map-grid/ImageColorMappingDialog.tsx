import { biomeName, waterTypeName } from '@/lib/map-grid/terrain-names'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { openFile, saveFile } from '@/lib/native-fs'
import { WATER_TYPE_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import {
  BIOMES,
  COLOR_LIMITS,
  buildPalette,
  isTransparentKey,
  parseKey,
  parseMappingFile,
  quantizeRgba,
  reseatMapping,
  resolveFill,
  suggestMapping,
  type ColorEntry,
  type ColorLimit,
  type ColorMapping,
  type ImageColorTarget,
  type SerializedImageMapping,
} from '@/lib/map-grid/image-color-mapping'
import type { GameCatalog } from '@/lib/catalog/types'
import { useTranslation } from 'react-i18next'
import { localName } from '@/lib/catalog/local-name'

export type { ImageColorTarget }

export interface ImportedImage {
  name: string
  buffer: ArrayBuffer
}

export interface ImageColorMappingResult {
  /** One colour key per map tile, row by row from the top (the image is scaled to the map size before this). */
  pixels: string[]
  width: number
  height: number
  mapping: Record<string, ImageColorTarget>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  image: ImportedImage | null
  sizeX: number
  sizeZ: number
  catalog: GameCatalog | null
  onApply: (result: ImageColorMappingResult, onProgress: (completed: number, total: number) => void) => Promise<void>
}

function imageMimeType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'bmp') return 'image/bmp'
  return 'application/octet-stream'
}

function objectMatches(entry: { id: string; name: string; category: string }, family: 'forest' | 'mountain'): boolean {
  const text = `${entry.id} ${entry.name}`.toLowerCase()
  if (family === 'forest') return /forest|tree|pine|wood|bush|shrub|oak|fir/.test(text)
  return /mountain|rock|cliff|stone|boulder|hill|peak/.test(text)
}

export default function ImageColorMappingDialog({ open, onOpenChange, image, sizeX, sizeZ, catalog, onApply }: Props) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ColorEntry[]>([])
  const [pixels, setPixels] = useState<string[]>([])
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null)
  const [mapping, setMapping] = useState<ColorMapping>({})
  const [family, setFamily] = useState<'forest' | 'mountain'>('forest')
  const [assetSearch, setAssetSearch] = useState('')
  const [colorLimit, setColorLimit] = useState<ColorLimit>(16)
  const [fillIgnored, setFillIgnored] = useState(false)
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const [loadNote, setLoadNote] = useState<{ matched: number; total: number } | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  // The palette the current mapping belongs to: another colour limit re-seats the choices instead of dropping them.
  const paletteRef = useRef<{ image: ImportedImage; keys: string[] } | null>(null)
  // A loaded file saved at another colour limit: applied once the palette of that limit exists.
  const pendingMappingRef = useRef<ColorMapping | null>(null)

  const objectById = useMemo(() => new Map((catalog?.mapObjects ?? []).map((entry) => [entry.id, entry])), [catalog])

  // A search covers every catalog object; without one the list is the forest or mountain family.
  // Objects already assigned to a colour always stay in the list, or their select would show a blank value.
  const objectIds = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()
    const ids = (catalog?.mapObjects ?? [])
      .filter((entry) => entry.id.trim() && (query ? `${entry.id} ${entry.name} ${entry.category}`.toLowerCase().includes(query) : objectMatches(entry, family)))
      .map((entry) => entry.id)
    const listed = new Set(ids)
    for (const target of Object.values(mapping)) {
      if (target.kind === 'object' && !listed.has(target.sid)) {
        listed.add(target.sid)
        ids.push(target.sid)
      }
    }
    return ids
  }, [catalog, family, assetSearch, mapping])

  const objectLabel = (sid: string): string => {
    const object = objectById.get(sid)
    return object ? `${localName(catalog, 'mapObjects', object)} (${object.id})` : sid
  }

  useEffect(() => {
    if (!open || !image) {
      setSourceImageUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([image.buffer], { type: imageMimeType(image.name) }))
    setSourceImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [open, image])

  useEffect(() => {
    if (!open || !image) {
      paletteRef.current = null
      return
    }
    let cancelled = false
    setError(null)
    setLoadNote(null)
    setHighlightKey(null)
    setEntries([])
    setPixels([])
    const load = async () => {
      try {
        const bitmap = await createImageBitmap(new Blob([image.buffer]))
        // Scaled to the map first: the colours listed are the tiles that will be painted, and the work no longer grows with the image.
        const canvas = document.createElement('canvas')
        canvas.width = sizeX
        canvas.height = sizeZ
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error(t('mapGrid.imageColorMappingDialog.cannotReadPixels'))
        const original = { width: bitmap.width, height: bitmap.height }
        // Smoothing blurs a small image into mud when it is enlarged, so only shrinking is smoothed.
        context.imageSmoothingEnabled = original.width * original.height > sizeX * sizeZ
        context.imageSmoothingQuality = 'high'
        context.drawImage(bitmap, 0, 0, sizeX, sizeZ)
        bitmap.close()
        const palette = buildPalette(quantizeRgba(context.getImageData(0, 0, sizeX, sizeZ).data, colorLimit))
        if (cancelled) return
        const keys = palette.entries.map((entry) => entry.key)
        const pending = pendingMappingRef.current
        pendingMappingRef.current = null
        if (pending) {
          const matched: ColorMapping = {}
          for (const key of keys) if (pending[key]) matched[key] = pending[key]
          setMapping(matched)
          setLoadNote({ matched: Object.keys(matched).length, total: Object.keys(pending).length })
        } else {
          const previous = paletteRef.current
          setMapping((current) => (previous && previous.image === image ? reseatMapping(previous.keys, current, keys) : {}))
        }
        paletteRef.current = { image, keys }
        setImageSize(original)
        setPixels(palette.pixels)
        setEntries(palette.entries)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only supplies an error text
  }, [open, image, colorLimit, sizeX, sizeZ])

  // The quantized preview, one canvas pixel per tile; the hovered colour stays solid and the rest fades.
  useEffect(() => {
    const canvas = previewRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || pixels.length === 0) return
    const frame = context.createImageData(sizeX, sizeZ)
    const rgba = new Map<string, number[]>()
    for (let i = 0; i < pixels.length; i++) {
      const key = pixels[i]
      let color = rgba.get(key)
      if (!color) {
        color = parseKey(key)
        rgba.set(key, color)
      }
      frame.data[i * 4] = color[0]
      frame.data[i * 4 + 1] = color[1]
      frame.data[i * 4 + 2] = color[2]
      frame.data[i * 4 + 3] = highlightKey && key !== highlightKey ? color[3] * 0.2 : color[3]
    }
    context.putImageData(frame, 0, 0)
  }, [pixels, highlightKey, sizeX, sizeZ])

  const pickFromPreview = (event: MouseEvent<HTMLCanvasElement>) => {
    // The canvas is letterboxed inside its box (object-contain), so the tile under the cursor is found from the drawn area.
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = Math.min(rect.width / sizeX, rect.height / sizeZ)
    const x = Math.floor((event.clientX - rect.left - (rect.width - sizeX * scale) / 2) / scale)
    const z = Math.floor((event.clientY - rect.top - (rect.height - sizeZ * scale) / 2) / scale)
    if (x < 0 || z < 0 || x >= sizeX || z >= sizeZ) return
    const key = pixels[z * sizeX + x]
    if (!key || isTransparentKey(key)) return
    setHighlightKey(key)
    rowRefs.current.get(key)?.scrollIntoView({ block: 'nearest' })
  }

  const saveMapping = async () => {
    const payload: SerializedImageMapping = { version: 1, name: image?.name ?? 'image', colorLimit, mappings: mapping }
    await saveFile(JSON.stringify(payload, null, 2), 'image2map-mapping.json', { name: t('shared.fileFilters.imageMapping'), extensions: ['json'] })
  }

  const loadMapping = async () => {
    const picked = await openFile()
    if (!picked) return
    const parsed = parseMappingFile(picked.content)
    if (!parsed) {
      setError(t('mapGrid.imageColorMappingDialog.invalidMappingFile'))
      return
    }
    setError(null)
    // Colour keys only match at the limit they were saved with, so a file from another limit switches to it first.
    if (parsed.colorLimit && parsed.colorLimit !== colorLimit) {
      pendingMappingRef.current = parsed.mappings
      setColorLimit(parsed.colorLimit)
      return
    }
    const present = new Set(entries.map((entry) => entry.key))
    const matched: ColorMapping = {}
    for (const [key, target] of Object.entries(parsed.mappings)) if (present.has(key)) matched[key] = target
    setMapping(matched)
    setLoadNote({ matched: Object.keys(matched).length, total: Object.keys(parsed.mappings).length })
  }

  const setTarget = (key: string, value: string) => {
    if (value === 'skip') {
      setMapping((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
      return
    }
    const [kind, raw] = value.split(':')
    const target: ImageColorTarget = kind === 'terrain'
      ? { kind: 'terrain', biomeId: Number(raw) as BiomeId }
      : kind === 'water'
        ? { kind: 'water', waterId: Number(raw) }
        : { kind: 'object', sid: decodeURIComponent(raw) }
    setMapping((previous) => ({ ...previous, [key]: target }))
  }

  const valueFor = (key: string): string => {
    const target = mapping[key]
    if (!target) return 'skip'
    return `${target.kind}:${target.kind === 'terrain' ? target.biomeId : target.kind === 'water' ? target.waterId : encodeURIComponent(target.sid)}`
  }

  const canApply = entries.length > 0 && pixels.length > 0 && Object.keys(mapping).length > 0

  const aspectOff = imageSize.width > 0 && Math.abs((imageSize.width / imageSize.height) / (sizeX / sizeZ) - 1) > 0.1
  const enlarged = imageSize.width > 0 && (imageSize.width < sizeX || imageSize.height < sizeZ)

  const handleApply = async () => {
    if (!canApply || applying) return
    setApplying(true)
    setApplyProgress(0)
    try {
      const resolved = resolveFill(entries.map((entry) => entry.key), mapping, fillIgnored)
      await onApply({ pixels, width: sizeX, height: sizeZ, mapping: resolved }, (completed, total) => {
        setApplyProgress(total > 0 ? completed / total : 1)
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('mapGrid.imageColorMappingDialog.mapImageColorsToThe')}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>{t('mapGrid.imageColorMappingDialog.sizeSummary', { name: image?.name, w: imageSize.width || '?', h: imageSize.height || '?', sx: sizeX, sz: sizeZ })}</p>
          <p>{t('mapGrid.imageColorMappingDialog.scaledToMap')}</p>
          <p>{t('mapGrid.imageColorMappingDialog.colorsAreReducedToAt', { colorLimit })}</p>
          {aspectOff && <p className="text-amber-600 dark:text-amber-400">{t('mapGrid.imageColorMappingDialog.aspectWarning', { iw: imageSize.width, ih: imageSize.height, sx: sizeX, sz: sizeZ })}</p>}
          {enlarged && <p className="text-amber-600 dark:text-amber-400">{t('mapGrid.imageColorMappingDialog.upscaleWarning')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium">{t('mapGrid.imageColorMappingDialog.loadedImage')}</p>
            {sourceImageUrl && (
              <img src={sourceImageUrl} alt={t('mapGrid.imageColorMappingDialog.loadedSource')} className="block w-full h-40 rounded border border-border object-contain bg-background" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium">{t('mapGrid.imageColorMappingDialog.quantizedPreviewColors', { colorLimit })}</p>
            {pixels.length > 0 && (
              <canvas
                ref={previewRef}
                width={sizeX}
                height={sizeZ}
                aria-label={t('mapGrid.imageColorMappingDialog.quantizedAlt', { colorLimit })}
                onClick={pickFromPreview}
                className="block w-full h-40 cursor-pointer rounded border border-border object-contain bg-background image-render-pixelated"
              />
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loadNote && <p className="text-xs text-muted-foreground">{t('mapGrid.imageColorMappingDialog.mappingLoaded', { matched: loadNote.matched, total: loadNote.total })}</p>}
        <div className="flex items-center gap-2 text-xs border-b border-border pb-2 flex-wrap">
          <span className="font-medium">{t('mapGrid.imageColorMappingDialog.reduceColors')}</span>
          <Select value={String(colorLimit)} onValueChange={(value) => setColorLimit(Number(value) as ColorLimit)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLOR_LIMITS.map((limit) => (
                <SelectItem key={limit} value={String(limit)}>{t(`mapGrid.imageColorMappingDialog.${limit}Colors`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="font-medium ml-2">{t('mapGrid.imageColorMappingDialog.assets')}</span>
          {(['forest', 'mountain'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={family === value}
              className={`px-2 py-1 rounded border ${family === value ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setFamily(value)}
            >
              {value === 'forest' ? t('mapGrid.imageColorMappingDialog.forest') : t('mapGrid.imageColorMappingDialog.mountain')}
            </button>
          ))}
          <Input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder={t('mapGrid.imageColorMappingDialog.searchAllAssets')} className="h-7 w-44 text-xs" />
        </div>
        <div className="min-h-0 overflow-y-auto border border-border rounded-md">
          {entries.map((entry) => (
            <div
              key={entry.key}
              ref={(element) => {
                if (element) rowRefs.current.set(entry.key, element)
                else rowRefs.current.delete(entry.key)
              }}
              onMouseEnter={() => setHighlightKey(entry.key)}
              onMouseLeave={() => setHighlightKey((current) => (current === entry.key ? null : current))}
              className={`grid grid-cols-[8rem_1fr] items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 ${highlightKey === entry.key ? 'bg-muted/40' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-5 w-5 rounded border border-border shrink-0" style={{ backgroundColor: entry.css }} />
                <span className="text-xs tabular-nums truncate" title={entry.key}>{t('mapGrid.imageColorMappingDialog.colorTiles', { n: entry.count.toLocaleString() })}</span>
              </div>
              <Select value={valueFor(entry.key)} onValueChange={(value) => setTarget(entry.key, value)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t('mapGrid.imageColorMappingDialog.ignoreThisColor')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t('mapGrid.imageColorMappingDialog.ignoreThisColor')}</SelectItem>
                  {BIOMES.map((biome) => (
                    <SelectItem key={`terrain:${biome}`} value={`terrain:${biome}`}>{t('mapGrid.imageColorMappingDialog.terrainOption', { name: biomeName(biome) })}</SelectItem>
                  ))}
                  {Object.keys(WATER_TYPE_NAMES).map((id) => (
                    <SelectItem key={`water:${id}`} value={`water:${id}`}>{t('mapGrid.imageColorMappingDialog.water', { name: waterTypeName(Number(id)) })}</SelectItem>
                  ))}
                  <SelectGroup>
                    <SelectLabel>
                      {assetSearch.trim()
                        ? t('mapGrid.imageColorMappingDialog.searchResults')
                        : family === 'forest' ? t('mapGrid.imageColorMappingDialog.forestAssets') : t('mapGrid.imageColorMappingDialog.mountainAssets')}
                    </SelectLabel>
                    {objectIds.map((sid) => (
                      <SelectItem key={`object:${sid}`} value={`object:${encodeURIComponent(sid)}`}>{t('mapGrid.imageColorMappingDialog.assetOption', { name: objectLabel(sid) })}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <div className="flex w-full items-center justify-start gap-2 border-b border-border pb-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => { void loadMapping() }}>{t('mapGrid.imageColorMappingDialog.loadMapping')}</Button>
            <Button variant="outline" size="sm" disabled={Object.keys(mapping).length === 0} onClick={() => { void saveMapping() }}>{t('mapGrid.imageColorMappingDialog.saveMapping')}</Button>
            <Button variant="outline" size="sm" disabled={entries.length === 0} onClick={() => setMapping((current) => suggestMapping(entries.map((entry) => entry.key), current))}>
              {t('mapGrid.imageColorMappingDialog.suggestMapping')}
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs">
              <Checkbox checked={fillIgnored} onCheckedChange={(value) => setFillIgnored(value === true)} />
              {t('mapGrid.imageColorMappingDialog.fillFromNearest')}
            </label>
          </div>
          <div className="flex w-full items-center justify-end gap-2">
            {applying && (
              <div className="mr-auto flex min-w-40 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                <progress className="h-2 w-24" max={1} value={applyProgress} />
                <span>{Math.round(applyProgress * 100)}%</span>
              </div>
            )}
            <Button variant="ghost" disabled={applying} onClick={() => onOpenChange(false)}>{t('shared.cancel')}</Button>
            <Button disabled={!canApply || applying} onClick={() => { void handleApply() }}>
              {t('mapGrid.imageColorMappingDialog.paintMappedColors')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
