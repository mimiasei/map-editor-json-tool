// ─── Minimal PNG decoder ─────────────────────────────────────────────────────
// Browsers hand back canvas pixels premultiplied by alpha, which wrecks colour where alpha is low. The game's ground textures
// keep a height map in alpha (most pixels below 128), so reading them through a canvas gives dark, noisy colours. This reads
// the file's own RGB. Handles what the sidecar writes (PIL, 8-bit, not interlaced); anything else throws.

export interface DecodedPng {
  width: number
  height: number
  /** RGBA; alpha is 255 unless `keepAlpha` was asked for. */
  rgba: Uint8ClampedArray
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decodePng(bytes: Uint8Array, keepAlpha = false): Promise<DecodedPng> {
  if (SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('not a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0, height = 0, channels = 0
  const idat: Uint8Array[] = []
  for (let pos = 8; pos + 8 <= bytes.length;) {
    const length = view.getUint32(pos)
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8))
    const data = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8)
      height = view.getUint32(pos + 12)
      const depth = data[8], colorType = data[9], interlace = data[12]
      if (depth !== 8 || interlace !== 0 || !CHANNELS[colorType]) throw new Error(`unsupported PNG (depth ${depth}, type ${colorType}, interlace ${interlace})`)
      channels = CHANNELS[colorType]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + length
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0))
  idat.reduce((at, c) => (joined.set(c, at), at + c.length), 0)
  const raw = await inflate(joined)

  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels] : 0
      const up = y > 0 ? pixels[row - stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft)
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      pixels[row + x] = (raw[src + x] + predictor) & 255
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels
    // Grey (1) and grey+alpha (2) have one colour channel; RGB (3) and RGBA (4) have three.
    const grey = channels < 3
    rgba[i * 4] = pixels[s]
    rgba[i * 4 + 1] = grey ? pixels[s] : pixels[s + 1]
    rgba[i * 4 + 2] = grey ? pixels[s] : pixels[s + 2]
    // Grey+alpha has its alpha second, RGBA fourth; the other types have none.
    rgba[i * 4 + 3] = keepAlpha && (channels === 2 || channels === 4) ? pixels[s + channels - 1] : 255
  }
  return { width, height, rgba }
}
