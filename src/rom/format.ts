/** Cartridge formats: NESdev iNES / NES 2.0, SNESdev ROM header and Tiles. */
export const MAX_ROM_SIZE = 8 * 1024 * 1024 + 512
export type TileFormat = 'nes' | 'snes2' | 'snes4' | 'snes8'
export interface Region { name: string; offset: number; size: number }
export interface RomInfo {
  system: 'NES' | 'SNES'; format: string; title: string; mapping: string
  regions: Region[]; warnings: string[]; dataOffset: number; headerOffset: number
  chr?: Region; checksum?: number; checksumPairValid?: boolean; canFixChecksum?: boolean
}
export const hex = (value: number, width = 6) => value.toString(16).toUpperCase().padStart(width, '0')
const word = (b: Uint8Array, at: number) => b[at] | b[at + 1] << 8
const pow2 = (n: number) => n > 0 && Number.isInteger(n) && (n & (n - 1)) === 0
export function parseHex(value: string, max: number): number {
  const clean = value.trim().replace(/^(0x|\$)/i, '')
  if (!/^[0-9a-f]+$/i.test(clean)) throw new Error('Enter a hexadecimal value, such as 004010 or FF.')
  const number = Number.parseInt(clean, 16)
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new Error(`Value must be between 0 and ${hex(max)}.`)
  return number
}
export function analyzeRom(name: string, bytes: Uint8Array): RomInfo {
  if (!/\.(nes|snes|sfc|smc)$/i.test(name)) throw new Error('Choose a .nes, .snes, .sfc or .smc ROM file.')
  if (bytes.length > MAX_ROM_SIZE) throw new Error('This ROM Lab supports files up to 8 MiB plus a 512-byte copier header.')
  if (/\.nes$/i.test(name)) return analyzeNes(name, bytes)
  return analyzeSnes(bytes)
}
function analyzeNes(name: string, b: Uint8Array): RomInfo {
  if (b.length < 16 || b[0] !== 0x4e || b[1] !== 0x45 || b[2] !== 0x53 || b[3] !== 0x1a) throw new Error('Missing NES cartridge signature. Expected an iNES or NES 2.0 file.')
  const nes2 = (b[7] & 12) === 8
  const size = (lo: number, hi: number, unit: number) => hi === 15 ? 2 ** (lo >> 2) * ((lo & 3) * 2 + 1) : ((hi << 8) | lo) * unit
  const prgSize = size(b[4], nes2 ? b[9] & 15 : 0, 16384)
  const chrSize = size(b[5], nes2 ? b[9] >> 4 : 0, 8192)
  const start = 16 + (b[6] & 4 ? 512 : 0), end = start + prgSize + chrSize
  if (!prgSize || !Number.isSafeInteger(end) || end > b.length) throw new Error('The NES header declares missing program or graphics bytes. This file is truncated or has an unsupported size.')
  const mapper = (b[6] >> 4) | (b[7] & 0xf0) | (nes2 ? (b[8] & 15) << 8 : 0)
  const regions: Region[] = [{ name: 'Cartridge header', offset: 0, size: 16 }]
  if (start > 16) regions.push({ name: 'Trainer', offset: 16, size: 512 })
  regions.push({ name: 'PRG · program + data', offset: start, size: prgSize })
  const chr = chrSize ? { name: 'CHR · graphics tiles', offset: start + prgSize, size: chrSize } : undefined
  if (chr) regions.push(chr)
  if (end < b.length) regions.push({ name: 'Additional cartridge data', offset: end, size: b.length - end })
  const warnings = ['Game logic, palettes and level layouts are game-specific. ROM bytes cannot recover the original source project.']
  if (!chr) warnings.push('This game uses CHR RAM. Its graphics are loaded by game code; there is no dedicated CHR ROM section to edit automatically.')
  if (!nes2 && b.slice(12, 16).some(v => v !== 0)) warnings.push('Legacy header padding is nonzero; mapper information may be ambiguous.')
  return { system: 'NES', title: name.replace(/\.nes$/i, ''), format: nes2 ? 'NES 2.0' : 'iNES', mapping: `Mapper ${mapper}${nes2 ? ` · submapper ${b[8] >> 4}` : ''}`, dataOffset: start, headerOffset: 0, regions, chr, warnings }
}
function analyzeSnes(b: Uint8Array): RomInfo {
  const dataOffset = b.length % 1024 === 512 ? 512 : 0, size = b.length - dataOffset
  if (size < 32768 || size % 32768 !== 0) throw new Error('Expected a non-interleaved SNES ROM with complete 32 KiB banks, optionally preceded by a 512-byte copier header.')
  const candidates = [{ at: 0x7fc0, mode: 0, name: 'LoROM' }, { at: 0xffc0, mode: 1, name: 'HiROM' }, { at: 0x40ffc0, mode: 5, name: 'ExHiROM' }]
    .filter(c => c.at + 64 <= size).map(c => {
      const at = c.at + dataOffset, mode = b[at + 21] & 15
      const printable = b.slice(at, at + 21).every(v => v >= 32 && v <= 126)
      const validMode = [0x20, 0x21, 0x22, 0x23, 0x25, 0x30, 0x31, 0x32, 0x35, 0x3a].includes(b[at + 21])
      const match = mode === c.mode || (c.mode === 0 && [2, 3].includes(mode)) || (c.mode === 1 && mode === 10)
      const reset = word(b, at + 60) >= 0x8000
      const pair = (word(b, at + 28) ^ word(b, at + 30)) === 0xffff
      return { ...c, at, score: (validMode && match ? 5 : -10) + (printable ? 3 : 0) + (reset ? 2 : -3) + (pair ? 3 : 0) }
    }).sort((a, c) => c.score - a.score)
  const selected = candidates[0]
  if (!selected || selected.score < 7) throw new Error('No recognizable SNES header was found. Interleaved, headerless homebrew and unusual cartridge layouts need a game-specific importer.')
  const at = selected.at, mode = b[at + 21] & 15, checksum = word(b, at + 30)
  const checksumPairValid = (checksum ^ word(b, at + 28)) === 0xffff
  const largest = 2 ** Math.floor(Math.log2(size)), rest = size - largest
  const declared = 1024 * 2 ** b[at + 23]
  const canFixChecksum = [0, 1, 5].includes(mode) && (pow2(size) || pow2(rest)) && declared === (rest ? largest * 2 : largest)
  const regions: Region[] = []
  if (dataOffset) regions.push({ name: 'Copier header (preserved)', offset: 0, size: dataOffset })
  regions.push({ name: 'Program + graphics + data', offset: dataOffset, size }, { name: 'Internal cartridge header', offset: at, size: 32 }, { name: 'Interrupt vectors', offset: at + 32, size: 32 })
  const warnings = ['Header location is inferred from cartridge metadata. Graphics offsets, palettes, compression and level data are game-specific.', 'Tile view interprets bytes as uncompressed planar graphics; it does not automatically find or decompress sprites.']
  if (!checksumPairValid) warnings.push('Stored checksum and complement do not agree. Use Repair checksum after editing when supported.')
  if (!canFixChecksum) warnings.push('Automatic checksum repair is unavailable for this declared size or special-chip mapping; export preserves checksum bytes unless you edit them.')
  return { system: 'SNES', format: dataOffset ? 'SNES + copier header' : 'SNES ROM', title: String.fromCharCode(...b.slice(at, at + 21)).trim(), mapping: `${selected.name} · mode $${hex(b[at + 21], 2)}`, regions, warnings, dataOffset, headerOffset: at, checksum, checksumPairValid, canFixChecksum }
}
export const tileBits = (format: TileFormat) => format === 'snes8' ? 8 : format === 'snes4' ? 4 : 2
export const tileBytes = (format: TileFormat) => tileBits(format) * 8
function planeByte(format: TileFormat, plane: number, y: number) {
  return format === 'nes' ? plane * 8 + y : Math.floor(plane / 2) * 16 + y * 2 + plane % 2
}
export function decodeTile(b: Uint8Array, offset: number, format: TileFormat): number[] {
  if (!Number.isInteger(offset) || offset < 0 || offset + tileBytes(format) > b.length) throw new Error('This tile extends beyond the ROM file.')
  return Array.from({ length: 64 }, (_, i) => {
    let pixel = 0
    for (let plane = 0; plane < tileBits(format); plane++) pixel |= ((b[offset + planeByte(format, plane, i >> 3)] >> (7 - i % 8)) & 1) << plane
    return pixel
  })
}
export function paintPixel(b: Uint8Array, offset: number, format: TileFormat, pixel: number, color: number): Uint8Array {
  decodeTile(b, offset, format)
  if (!Number.isInteger(pixel) || pixel < 0 || pixel > 63 || !Number.isInteger(color) || color < 0 || color >= 2 ** tileBits(format)) throw new Error('Invalid pixel or palette index.')
  const result = b.slice(), mask = 1 << (7 - pixel % 8)
  for (let plane = 0; plane < tileBits(format); plane++) {
    const address = offset + planeByte(format, plane, pixel >> 3)
    result[address] = (result[address] & ~mask) | ((color >> plane & 1) ? mask : 0)
  }
  return result
}
export function setSnesTitle(b: Uint8Array, info: RomInfo, title: string): Uint8Array {
  if (info.system !== 'SNES' || !/^[\x20-\x7e]{1,21}$/.test(title)) throw new Error('The SNES title must contain 1–21 printable ASCII characters.')
  const result = b.slice()
  result.set(Array.from(title.padEnd(21, ' '), c => c.charCodeAt(0)), info.headerOffset)
  return result
}
export function repairSnesChecksum(b: Uint8Array, info: RomInfo): Uint8Array {
  if (info.system !== 'SNES' || !info.canFixChecksum) throw new Error('Checksum repair requires a standard LoROM, HiROM or ExHiROM layout with a matching declared size.')
  const result = b.slice(), at = info.headerOffset + 28
  result.set([255, 255, 0, 0], at)
  const data = result.subarray(info.dataOffset), largest = 2 ** Math.floor(Math.log2(data.length)), rest = data.length - largest
  let sum = 0
  for (let i = 0; i < data.length; i++) sum = (sum + data[i] * (i >= largest && rest ? largest / rest : 1)) & 0xffff
  result[at] = (sum ^ 0xffff) & 255; result[at + 1] = (sum ^ 0xffff) >> 8
  result[at + 2] = sum & 255; result[at + 3] = sum >> 8
  return result
}
/** IPS with same-size records, including the reserved EOF-offset edge case. */
export function createIps(original: Uint8Array, modified: Uint8Array): Uint8Array {
  if (original.length !== modified.length || modified.length > 0xffffff) throw new Error('IPS export requires matching ROM sizes under 16 MiB.')
  const out: number[] = [80, 65, 84, 67, 72]
  for (let i = 0; i < modified.length;) {
    if (original[i] === modified[i]) { i++; continue }
    const start = i === 0x454f46 ? i - 1 : i
    i++
    while (i < modified.length && i - start < 65535 && original[i] !== modified[i]) i++
    const size = i - start
    out.push(start >> 16 & 255, start >> 8 & 255, start & 255, size >> 8, size & 255)
    for (let j = start; j < i; j++) out.push(modified[j])
  }
  out.push(69, 79, 70)
  return new Uint8Array(out)
}
export function changedBytes(a: Uint8Array, b: Uint8Array): number {
  let count = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
  return count
}
