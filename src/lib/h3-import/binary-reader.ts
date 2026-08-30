// ─── Low-level H3M byte reader ────────────────────────────────────────────────
// H3's own binary layout (little-endian throughout, cp1252-encoded strings) —
// deliberately separate from map-write.ts's own LEB128/varint reader, which
// is unrelated to this format. Ported from the reference project
// (leviritchie/homm3-olden-stock-translator)'s `h3m_format.py` binary-field
// conventions, used with the author's explicit permission.

export class BinaryReader {
  private pos = 0
  constructor(private readonly data: Uint8Array) {}

  get offset(): number { return this.pos }
  get length(): number { return this.data.length }
  atEnd(): boolean { return this.pos >= this.data.length }

  private require(n: number, label: string): void {
    if (this.pos + n > this.data.length) {
      throw new Error(`H3M read past end of file at "${label}" (offset ${this.pos}, need ${n} bytes, have ${this.data.length - this.pos})`)
    }
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.data.length) throw new Error(`H3M seek out of bounds: ${pos}`)
    this.pos = pos
  }

  skip(n: number): void {
    this.require(n, 'skip')
    this.pos += n
  }

  /** Every "must be zero" padding check in the reference format is a real
   *  integrity signal, not decorative — a non-zero byte here means the byte
   *  cursor has already desynced from a mis-decoded earlier field. */
  skipZeroCheck(n: number, label: string): void {
    this.require(n, label)
    for (let i = 0; i < n; i++) {
      if (this.data[this.pos + i] !== 0) {
        throw new Error(`H3M expected ${n} zero bytes at "${label}" (offset ${this.pos}), found nonzero byte at +${i}`)
      }
    }
    this.pos += n
  }

  readU8(): number {
    this.require(1, 'u8')
    return this.data[this.pos++]
  }

  readI8(): number {
    const v = this.readU8()
    return v >= 0x80 ? v - 0x100 : v
  }

  readBool(): boolean {
    return this.readU8() !== 0
  }

  readU16(): number {
    this.require(2, 'u16')
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8)
    this.pos += 2
    return v >>> 0
  }

  readU32(): number {
    this.require(4, 'u32')
    const v = (
      this.data[this.pos] |
      (this.data[this.pos + 1] << 8) |
      (this.data[this.pos + 2] << 16) |
      (this.data[this.pos + 3] << 24)
    )
    this.pos += 4
    return v >>> 0
  }

  readI32(): number {
    this.require(4, 'i32')
    const v = (
      this.data[this.pos] |
      (this.data[this.pos + 1] << 8) |
      (this.data[this.pos + 2] << 16) |
      (this.data[this.pos + 3] << 24)
    )
    this.pos += 4
    return v | 0
  }

  readBytes(n: number): Uint8Array {
    this.require(n, 'bytes')
    const out = this.data.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }

  /** u32 length prefix + that many cp1252-decoded bytes — H3's only string
   *  encoding, used for every title/description/name/message field. */
  readString(maxLength = 1 << 20): string {
    const len = this.readU32()
    if (len > maxLength) throw new Error(`H3M string length ${len} exceeds sanity limit ${maxLength}`)
    const bytes = this.readBytes(len)
    return decodeCp1252(bytes)
  }
}

let cp1252Decoder: TextDecoder | null | undefined
function decodeCp1252(bytes: Uint8Array): string {
  if (cp1252Decoder === undefined) {
    try { cp1252Decoder = new TextDecoder('windows-1252') } catch { cp1252Decoder = null }
  }
  if (cp1252Decoder) return cp1252Decoder.decode(bytes)
  // Fallback: cp1252 is byte-identical to latin-1 (ISO-8859-1) outside the
  // 0x80-0x9F control-code range, which real map text essentially never uses.
  let out = ''
  for (const b of bytes) out += String.fromCharCode(b)
  return out
}
