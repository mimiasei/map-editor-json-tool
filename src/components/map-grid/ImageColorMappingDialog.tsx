import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { openFile, saveFile } from '@/lib/native-fs'
import { BIOME_NAMES, WATER_TYPE_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import type { GameCatalog } from '@/lib/catalog/types'

export interface ImportedImage {
  name: string
  buffer: ArrayBuffer
}

export type ImageColorTarget =
  | { kind: 'terrain'; biomeId: BiomeId }
  | { kind: 'water'; waterId: number }
  | { kind: 'object'; sid: string }

export interface ImageColorMappingResult {
  pixels: string[]
  width: number
  height: number
  mapping: Record<string, ImageColorTarget>
}

interface SerializedImageMapping {
  version: 1
  name: string
  mappings: Record<string, ImageColorTarget>
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

type ColorEntry = { key: string; css: string; count: number }

const BIOMES: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

function colorKey(r: number, g: number, b: number, a: number): string {
  return `${r},${g},${b},${a}`
}

function colorCss(key: string): string {
  const [r, g, b, a] = key.split(',').map(Number)
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

function colorDistance(left: string, right: string): number {
  const a = left.split(',').map(Number)
  const b = right.split(',').map(Number)
  const redMean = (a[0] + b[0]) / 2
  const red = a[0] - b[0]
  const green = a[1] - b[1]
  const blue = a[2] - b[2]
  // A lightweight perceptual RGB distance: red/blue weights vary with hue.
  return (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue
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

function quantizeChannel(value: number, levels: number): number {
  if (levels <= 1) return 0
  return Math.round((Math.round(value / 255 * (levels - 1)) / (levels - 1)) * 255)
}

/** Deterministic RGB reduction with a strict maximum of 8, 16, or 32 bins. */
function quantizeRgba(data: Uint8ClampedArray, colorLimit: 8 | 16 | 32): Uint8ClampedArray {
  const channelLevels = colorLimit === 8 ? [2, 2, 2] : colorLimit === 16 ? [2, 2, 4] : [2, 4, 4]
  const output = new Uint8ClampedArray(data)
  for (let i = 0; i < output.length; i += 4) {
    output[i] = quantizeChannel(output[i], channelLevels[0])
    output[i + 1] = quantizeChannel(output[i + 1], channelLevels[1])
    output[i + 2] = quantizeChannel(output[i + 2], channelLevels[2])
  }
  return output
}

function objectLabel(sid: string, catalog: GameCatalog | null): string {
  const object = catalog?.mapObjects.find((entry) => entry.id === sid)
  return object ? `${object.name} (${object.id})` : sid
}

function objectMatches(entry: { id: string; name: string; category: string }, family: 'forest' | 'mountain'): boolean {
  const text = `${entry.id} ${entry.name}`.toLowerCase()
  if (family === 'forest') return /forest|tree|pine|wood|bush|shrub|oak|fir/.test(text)
  return /mountain|rock|cliff|stone|boulder|hill|peak/.test(text)
}

export default function ImageColorMappingDialog({ open, onOpenChange, image, sizeX, sizeZ, catalog, onApply }: Props) {
  const [entries, setEntries] = useState<ColorEntry[]>([])
  const [pixels, setPixels] = useState<string[]>([])
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null)
  const [quantizedImageUrl, setQuantizedImageUrl] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, ImageColorTarget>>({})
  const [family, setFamily] = useState<'forest' | 'mountain'>('forest')
  const [assetSearch, setAssetSearch] = useState('')
  const [colorLimit, setColorLimit] = useState<8 | 16 | 32>(16)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const objectOptions = useMemo(() => {
    const query = assetSearch.trim().toLowerCase()
    const all = (catalog?.mapObjects ?? []).filter((entry) => {
      if (!entry.id.trim()) return false
      if (query && !`${entry.id} ${entry.name} ${entry.category}`.toLowerCase().includes(query)) return false
      return true
    })
    return all.filter((entry) => objectMatches(entry, family))
  }, [catalog, family, assetSearch])

  useEffect(() => {
    if (!open || !image) return
    let cancelled = false
    setError(null)
    setEntries([])
    setPixels([])
    setMapping({})
    const sourceUrl = URL.createObjectURL(new Blob([image.buffer], { type: imageMimeType(image.name) }))
    setSourceImageUrl(sourceUrl)
    setQuantizedImageUrl(null)
    const load = async () => {
      try {
        const blob = new Blob([image.buffer])
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not read the image pixels.')
        context.drawImage(bitmap, 0, 0)
        bitmap.close()
        const data = quantizeRgba(context.getImageData(0, 0, canvas.width, canvas.height).data, colorLimit)
        context.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0)
        const previewUrl = canvas.toDataURL('image/png')
        const counts = new Map<string, number>()
        const imagePixels: string[] = []
        for (let i = 0; i < data.length; i += 4) {
          const key = colorKey(data[i], data[i + 1], data[i + 2], data[i + 3])
          imagePixels.push(key)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        if (cancelled) return
        setImageSize({ width: canvas.width, height: canvas.height })
        setQuantizedImageUrl(previewUrl)
        setPixels(imagePixels)
        setEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, css: colorCss(key), count })))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
      URL.revokeObjectURL(sourceUrl)
    }
  }, [open, image, colorLimit])

  useEffect(() => () => {
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl)
    if (quantizedImageUrl?.startsWith('blob:')) URL.revokeObjectURL(quantizedImageUrl)
  }, [sourceImageUrl, quantizedImageUrl])

  const saveMapping = async () => {
    const payload: SerializedImageMapping = { version: 1, name: image?.name ?? 'image', mappings: mapping }
    await saveFile(JSON.stringify(payload, null, 2), 'image2map-mapping.json', { name: 'Image2Map mapping', extensions: ['json'] })
  }

  const loadMapping = async () => {
    const picked = await openFile()
    if (!picked) return
    try {
      const parsed = JSON.parse(picked.content) as Partial<SerializedImageMapping>
      if (parsed.version !== 1 || !parsed.mappings || typeof parsed.mappings !== 'object') throw new Error('Not a valid Image2Map mapping file.')
      const validMappings: Record<string, ImageColorTarget> = {}
      for (const [key, target] of Object.entries(parsed.mappings)) {
        if (!/^\d+,\d+,\d+,\d+$/.test(key) || !target || typeof target !== 'object') continue
        if (target.kind === 'terrain' && BIOMES.includes(target.biomeId)) validMappings[key] = target
        else if (target.kind === 'water' && Object.prototype.hasOwnProperty.call(WATER_TYPE_NAMES, target.waterId)) validMappings[key] = target
        else if (target.kind === 'object' && typeof target.sid === 'string' && target.sid.trim()) validMappings[key] = target
      }
      setMapping(validMappings)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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

  const canApply = entries.length > 0 && pixels.length > 0 && imageSize.width > 0 && imageSize.height > 0 && Object.keys(mapping).length > 0

  const handleApply = async () => {
    if (!canApply || applying) return
    setApplying(true)
    setApplyProgress(0)
    try {
      const mappedKeys = Object.keys(mapping)
      const resolvedMapping = { ...mapping }
      for (const entry of entries) {
        if (resolvedMapping[entry.key] || mappedKeys.length === 0) continue
        let nearestKey = mappedKeys[0]
        let nearestDistance = colorDistance(entry.key, nearestKey)
        for (const candidate of mappedKeys.slice(1)) {
          const distance = colorDistance(entry.key, candidate)
          if (distance < nearestDistance) {
            nearestKey = candidate
            nearestDistance = distance
          }
        }
        resolvedMapping[entry.key] = mapping[nearestKey]
      }
      await onApply({ pixels, width: imageSize.width, height: imageSize.height, mapping: resolvedMapping }, (completed, total) => {
        setApplyProgress(total > 0 ? completed / total : 1)
      })
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Map image colors to the map</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>{image?.name} · {imageSize.width || '?'} × {imageSize.height || '?'} pixels → {sizeX} × {sizeZ} map tiles</p>
          <p>Colors are reduced to at most {colorLimit} colors before mapping. Unmapped colors are ignored.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-2">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium">Loaded image</p>
            {sourceImageUrl && (
              <img src={sourceImageUrl} alt="Loaded source" className="block w-full h-28 rounded border border-border object-contain bg-background" />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium">Quantized preview ({colorLimit} colors)</p>
            {quantizedImageUrl && (
              <img src={quantizedImageUrl} alt={`Quantized to ${colorLimit} colors`} className="block w-full h-28 rounded border border-border object-contain bg-background image-render-pixelated" />
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2 text-xs border-b border-border pb-2 flex-wrap">
          <span className="font-medium">Reduce colors:</span>
          <Select value={String(colorLimit)} onValueChange={(value) => setColorLimit(Number(value) as 8 | 16 | 32)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="8">8 colors</SelectItem>
              <SelectItem value="16">16 colors</SelectItem>
              <SelectItem value="32">32 colors</SelectItem>
            </SelectContent>
          </Select>
          <span className="font-medium ml-2">Assets:</span>
          {(['forest', 'mountain'] as const).map((value) => (
            <button
              key={value}
              className={`px-2 py-1 rounded border ${family === value ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setFamily(value)}
            >
              {value === 'forest' ? 'Forest' : 'Mountain'}
            </button>
          ))}
          <Input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search all assets…" className="h-7 w-44 text-xs" />
        </div>
        <div className="min-h-0 overflow-y-auto border border-border rounded-md">
          {entries.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[7rem_1fr] items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-5 w-5 rounded border border-border shrink-0" style={{ backgroundColor: entry.css }} />
                <span className="text-xs tabular-nums truncate" title={entry.key}>{entry.count.toLocaleString()} px</span>
              </div>
              <Select value={valueFor(entry.key)} onValueChange={(value) => setTarget(entry.key, value)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Ignore this color" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Ignore this color</SelectItem>
                  {BIOMES.map((biome) => (
                    <SelectItem key={`terrain:${biome}`} value={`terrain:${biome}`}>Terrain: {BIOME_NAMES[biome]}</SelectItem>
                  ))}
                  {Object.entries(WATER_TYPE_NAMES).map(([id, name]) => (
                    <SelectItem key={`water:${id}`} value={`water:${id}`}>Water: {name}</SelectItem>
                  ))}
                  <SelectGroup>
                    <SelectLabel>{family === 'forest' ? 'Forest assets' : 'Mountain assets'}</SelectLabel>
                    {objectOptions.map((object) => (
                      <SelectItem key={`object:${object.id}`} value={`object:${encodeURIComponent(object.id)}`}>Asset: {objectLabel(object.id, catalog)}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <div className="flex w-full items-center justify-start gap-2 border-b border-border pb-2">
            <Button variant="outline" size="sm" onClick={() => { void loadMapping() }}>Load mapping</Button>
            <Button variant="outline" size="sm" disabled={Object.keys(mapping).length === 0} onClick={() => { void saveMapping() }}>Save mapping</Button>
          </div>
          <div className="flex w-full items-center justify-end gap-2">
            {applying && (
              <div className="mr-auto flex min-w-40 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                <progress className="h-2 w-24" max={1} value={applyProgress} />
                <span>{Math.round(applyProgress * 100)}%</span>
              </div>
            )}
            <Button variant="ghost" disabled={applying} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!canApply || applying} onClick={() => { void handleApply() }}>
              Paint mapped colors
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
