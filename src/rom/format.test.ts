import { describe, expect, it } from 'vitest'
import { analyzeRom, createIps, decodeTile, MAX_ROM_SIZE, paintPixel, parseHex, repairSnesChecksum, setSnesTitle, tileBytes, type TileFormat } from './format'

function nes(chr = 1, trainer = false) {
  const bytes = new Uint8Array(16 + (trainer ? 512 : 0) + 16384 + chr * 8192)
  bytes.set([78, 69, 83, 26, 1, chr, trainer ? 4 : 0, 0]); return bytes
}
function snes(mapping: 'LoROM' | 'HiROM' | 'ExHiROM' = 'LoROM', size = 32768, copier = false) {
  const bytes = new Uint8Array(size + (copier ? 512 : 0)), header = (mapping === 'LoROM' ? 0x7fc0 : mapping === 'HiROM' ? 0xffc0 : 0x40ffc0) + (copier ? 512 : 0)
  bytes.set(Array.from('MY HOMEBREW'.padEnd(21, ' '), c => c.charCodeAt(0)), header)
  bytes[header + 21] = mapping === 'LoROM' ? 0x20 : mapping === 'HiROM' ? 0x21 : 0x25
  bytes[header + 23] = Math.ceil(Math.log2(size / 1024)); bytes[header + 61] = 0x80
  bytes.set([255, 255, 0, 0], header + 28)
  return bytes
}
// Independent minimal decoder for the exported standard IPS records.
function applyIps(original: Uint8Array, patch: Uint8Array) {
  expect(new TextDecoder().decode(patch.subarray(0, 5))).toBe('PATCH')
  const result = original.slice()
  let i = 5
  while (!(patch[i] === 69 && patch[i + 1] === 79 && patch[i + 2] === 70)) {
    const offset = patch[i] * 65536 + patch[i + 1] * 256 + patch[i + 2], length = patch[i + 3] * 256 + patch[i + 4]
    expect(length).toBeGreaterThan(0)
    result.set(patch.subarray(i + 5, i + 5 + length), offset); i += length + 5
  }
  expect(i + 3).toBe(patch.length)
  return result
}

describe('cartridge import and layout', () => {
  it('finds PRG/CHR after a trainer and preserves extra bytes', () => {
    const base = nes(1, true), bytes = new Uint8Array(base.length + 7); bytes.set(base)
    const info = analyzeRom('trainer.nes', bytes)
    expect(info.chr).toMatchObject({ offset: 16912, size: 8192 })
    expect(info.regions.at(-1)?.size).toBe(7)
    expect(info.mapping).toBe('Mapper 0')
  })
  it('recognizes NES 2.0 mapper, submapper and exponent size encoding', () => {
    const bytes = nes(); bytes[7] = 0x28; bytes[6] = 0x30; bytes[8] = 0x41
    bytes[4] = 14 << 2; bytes[5] = 13 << 2; bytes[9] = 0xff
    const info = analyzeRom('modern.nes', bytes)
    expect(info.format).toBe('NES 2.0'); expect(info.mapping).toBe('Mapper 291 · submapper 4')
    expect(info.chr?.offset).toBe(16400)
  })
  it('handles CHR RAM without inventing an editable graphics section', () => {
    const info = analyzeRom('ram.nes', nes(0))
    expect(info.chr).toBeUndefined(); expect(info.warnings.join()).toContain('CHR RAM')
  })
  it('rejects disguised, truncated, oversized and invalid inputs', () => {
    expect(() => analyzeRom('wrong.nes', new Uint8Array(100))).toThrow('signature')
    expect(() => analyzeRom('short.nes', nes().subarray(0, 200))).toThrow('truncated')
    expect(() => analyzeRom('huge.nes', new Uint8Array(MAX_ROM_SIZE + 1))).toThrow('8 MiB')
    expect(() => analyzeRom('script.php', nes())).toThrow('Choose')
    expect(() => analyzeRom('wrong.snes', new Uint8Array(32768))).toThrow('No recognizable')
    expect(() => analyzeRom('partial.snes', new Uint8Array(1000))).toThrow('32 KiB')
  })
  it.each(['LoROM', 'HiROM', 'ExHiROM'] as const)('detects %s and copier header independently of extension', mapping => {
    const size = mapping === 'ExHiROM' ? 8 * 1024 * 1024 : 65536
    const bytes = snes(mapping, size, true), info = analyzeRom('homebrew.snes', bytes)
    expect(info.mapping).toContain(mapping); expect(info.dataOffset).toBe(512)
    expect(info.title).toBe('MY HOMEBREW'); expect(info.canFixChecksum).toBe(true)
    expect(analyzeRom('homebrew.smc', bytes).headerOffset).toBe(info.headerOffset)
  })
  it('does not offer checksum repair on unsupported special-chip or mismatched sizes', () => {
    const bytes = snes(); bytes[0x7fd5] = 0x23
    expect(analyzeRom('sa1.sfc', bytes).canFixChecksum).toBe(false)
    bytes[0x7fd5] = 0x20; bytes[0x7fd7] = 12
    expect(analyzeRom('bad-size.sfc', bytes).canFixChecksum).toBe(false)
  })
})
describe('tile editing', () => {
  it('decodes the documented NES half-symbol bitplanes', () => {
    const bytes = new Uint8Array([0x41, 0xc2, 0x44, 0x48, 0x10, 0x20, 0x40, 0x80, 1, 2, 4, 8, 0x16, 0x21, 0x42, 0x87])
    const pixels = decodeTile(bytes, 0, 'nes')
    expect(pixels.slice(0, 8)).toEqual([0, 1, 0, 0, 0, 0, 0, 3])
    expect(pixels.slice(-8)).toEqual([3, 0, 0, 0, 0, 2, 2, 2])
  })
  it('reads SNES paired planes using the documented row example', () => {
    const bytes = new Uint8Array(32); bytes.set([0b00011101, 0b01010101]); bytes[16] = 128; bytes[17] = 64
    expect(decodeTile(bytes, 0, 'snes2').slice(0, 8)).toEqual([0, 2, 0, 3, 1, 3, 0, 3])
    expect(decodeTile(bytes, 0, 'snes4').slice(0, 2)).toEqual([4, 10])
  })
  it.each(['nes', 'snes2', 'snes4', 'snes8'] as TileFormat[])('paints %s without changing adjacent pixels or the original', format => {
    const bytes = new Uint8Array(tileBytes(format) + 2).fill(0x55), before = decodeTile(bytes, 1, format)
    const result = paintPixel(bytes, 1, format, 19, 3), after = decodeTile(result, 1, format)
    expect(after[19]).toBe(3)
    expect(after.filter((_, i) => i !== 19)).toEqual(before.filter((_, i) => i !== 19))
    expect([...bytes].every(v => v === 0x55)).toBe(true); expect(result[0]).toBe(0x55); expect(result.at(-1)).toBe(0x55)
  })
  it('rejects tile boundaries and invalid palette indices', () => {
    expect(() => decodeTile(new Uint8Array(16), 1, 'nes')).toThrow('beyond')
    expect(() => paintPixel(new Uint8Array(16), 0, 'nes', 64, 1)).toThrow('Invalid')
    expect(() => paintPixel(new Uint8Array(16), 0, 'nes', 0, 4)).toThrow('Invalid')
  })
})
describe('ROM and patch export', () => {
  it('updates an SNES ASCII title without touching the source or adjacent fields', () => {
    const original = snes(), info = analyzeRom('game.snes', original), next = setSnesTitle(original, info, 'PENGUIN PUNCH')
    expect(analyzeRom('game.snes', next).title).toBe('PENGUIN PUNCH'); expect(analyzeRom('game.snes', original).title).toBe('MY HOMEBREW')
    expect(next[info.headerOffset + 21]).toBe(0x20)
    expect(() => setSnesTitle(original, info, '🐧')).toThrow('ASCII')
  })
  it.each([32768, 3 * 1024 * 1024])('repairs a %i-byte SNES checksum and preserves the copier header', size => {
    const original = snes('LoROM', size, true); original.fill(97, 0, 512); original[10000] = 123
    const info = analyzeRom('game.snes', original), fixed = repairSnesChecksum(original, info)
    expect(fixed.subarray(0, 512)).toEqual(original.subarray(0, 512))
    // Independent expanded memory image: duplicate final 1 MiB in a 3 MiB cartridge.
    const data = fixed.subarray(512), expanded = new Uint8Array(size === 32768 ? size : 4 * 1024 * 1024)
    expanded.set(data); if (size !== 32768) expanded.set(data.subarray(2 * 1024 * 1024), size)
    const checksum = expanded.reduce((sum, byte) => (sum + byte) & 65535, 0)
    expect(analyzeRom('game.snes', fixed).checksum).toBe(checksum)
    expect(analyzeRom('game.snes', fixed).checksumPairValid).toBe(true)
  })
  it('exports independently applicable IPS for sparse, long and reserved-offset edits', () => {
    const original = new Uint8Array(0x454f48), modified = original.slice()
    modified.fill(17, 200, 70200); modified[10] = 28; modified[0x454f46] = 42
    expect(applyIps(original, createIps(original, modified)).every((v, i) => v === modified[i])).toBe(true)
    expect(applyIps(original, createIps(original, original)).every((v, i) => v === original[i])).toBe(true)
  })
  it('validates byte/offset input without silently accepting partial hex values', () => {
    expect(parseHex('$00FF', 255)).toBe(255)
    expect(() => parseHex('FG', 255)).toThrow('hexadecimal')
    expect(() => parseHex('100', 255)).toThrow('between')
    expect(() => createIps(new Uint8Array(1), new Uint8Array(2))).toThrow('matching')
  })
})
