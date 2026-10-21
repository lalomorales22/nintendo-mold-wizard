import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeRom, changedBytes, createIps, decodeTile, hex, MAX_ROM_SIZE, paintPixel, parseHex, repairSnesChecksum, setSnesTitle, tileBits, tileBytes, type TileFormat } from '../rom/format'
import { getRom, listRoms, saveRom, summarizeRom, type RomProject, type RomSummary } from '../rom/storage'
import '../rom/rom.css'

const COLORS = ['#15171b', '#faf0ce', '#ec363b', '#6da8e8', '#5ca66e', '#f2c65c', '#b68bd0', '#f29b65', '#808590', '#ffffff', '#b92331', '#324c99', '#23684b', '#977732', '#685d86', '#d8b9a3']
const previewColor = (index: number) => index < 16 ? COLORS[index] : `hsl(${index * 137.5 % 360} 55% ${35 + index % 5 * 10}%)`
function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
interface Edit { offset: number; before: number; after: number }
function TileSheet({ bytes, offset, format, count, selected, choose }: { bytes: Uint8Array; offset: number; format: TileFormat; count: number; selected: number; choose: (tile: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#15171b'; ctx.fillRect(0, 0, 256, 64)
    for (let tile = 0; tile < count; tile++) decodeTile(bytes, offset + tile * tileBytes(format), format).forEach((pixel, i) => {
      ctx.fillStyle = previewColor(pixel)
      ctx.fillRect((tile % 16 * 8 + i % 8) * 2, (Math.floor(tile / 16) * 8 + (i >> 3)) * 2, 2, 2)
    })
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(selected % 16 * 16 + .5, Math.floor(selected / 16) * 16 + .5, 15, 15)
  }, [bytes, offset, format, count, selected])
  return <canvas ref={canvas} width={256} height={64} className="rom-tile-canvas" aria-label="Graphics tile sheet; select a tile using the Tile number field below" onClick={event => {
    const r = event.currentTarget.getBoundingClientRect()
    const tile = Math.floor((event.clientX - r.left) / r.width * 16) + Math.floor((event.clientY - r.top) / r.height * 4) * 16
    if (tile >= 0 && tile < count) choose(tile)
  }} />
}
export function RomLab() {
  const [projects, setProjects] = useState<RomSummary[]>([])
  const [project, setProject] = useState<RomProject | null>(null)
  const [tab, setTab] = useState<'overview' | 'tiles' | 'bytes'>('overview')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [saveStatus, setSaveStatus] = useState(''), [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Edit[][]>([]), [redo, setRedo] = useState<Edit[][]>([])
  const [offset, setOffset] = useState(0), [offsetText, setOffsetText] = useState('000000'), [selectedTile, setSelectedTile] = useState(0)
  const [format, setFormat] = useState<TileFormat>('nes'), [color, setColor] = useState(1)
  const [byteOffset, setByteOffset] = useState(0), [byteValue, setByteValue] = useState('00'), [bytePage, setBytePage] = useState(0), [jump, setJump] = useState('000000')
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const importing = useRef(false)
  const exported = useRef<RomProject | null>(null)
  useEffect(() => { listRoms().then(setProjects).catch(e => setError(e.message)) }, [])
  // Each change is committed immediately; IndexedDB serializes writes in order.
  useEffect(() => {
    if (!project) return
    let current = true
    saveRom(project).then(() => {
      if (!current) return
      setSaveStatus('Saved in this browser')
      setProjects(list => [summarizeRom(project), ...list.filter(p => p.id !== project.id)])
    }).catch(e => { if (current) { setSaveStatus('Not saved — export a copy'); setError(e.message) } })
    return () => { current = false }
  }, [project])
  useEffect(() => {
    if (!project || saveStatus === 'Saved in this browser') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [project, saveStatus])
  const original = project?.original, name = project?.name
  const originalInfo = useMemo(() => original && name ? analyzeRom(name, original) : null, [original, name])
  const analysis = useMemo(() => {
    if (!project) return { info: null, error: '' }
    try { return { info: analyzeRom(project.name, project.modified), error: '' } }
    catch (e) { return { info: originalInfo, error: (e as Error).message } }
  }, [project, originalInfo])
  const info = analysis.info
  const changes = useMemo(() => project ? changedBytes(project.original, project.modified) : 0, [project])
  const open = (p: RomProject) => {
    if (project && saveStatus !== 'Saved in this browser' && exported.current !== project) { setError('Wait for local saving, or export your current ROM before switching projects.'); return }
    const meta = analyzeRom(p.name, p.original), start = meta.chr?.offset ?? meta.dataOffset
    setSaveStatus('Saving locally…'); setProject(p); setHistory([]); setRedo([]); setTab('overview'); setError(''); setNotice(''); setTitle((() => { try { return analyzeRom(p.name, p.modified).title } catch { return meta.title } })())
    setOffset(start); setOffsetText(hex(start)); setSelectedTile(0); setFormat(meta.system === 'NES' ? 'nes' : 'snes4'); setColor(1)
    setByteOffset(0); setByteValue(hex(p.modified[0], 2)); setBytePage(0); setJump('000000')
  }
  const importFile = async (file?: File) => {
    if (!file || importing.current) return
    if (project && saveStatus !== 'Saved in this browser' && exported.current !== project) { setError('Save or export the current ROM before importing another.'); return }
    importing.current = true; setLoading(true); setError('')
    try {
      if (file.size > MAX_ROM_SIZE) throw new Error('Choose a ROM no larger than 8 MiB plus a 512-byte copier header.')
      const bytes = new Uint8Array(await file.arrayBuffer()), meta = analyzeRom(file.name, bytes)
      const now = new Date().toISOString()
      open({ id: crypto.randomUUID(), name: file.name, system: meta.system, original: bytes, modified: bytes.slice(), importedAt: now, savedAt: now })
    } catch (e) { setError((e as Error).message) }
    finally { importing.current = false; setLoading(false); if (input.current) input.current.value = '' }
  }
  const apply = (next: Uint8Array, label: string) => {
    if (!project) return
    const edit: Edit[] = []
    for (let i = 0; i < next.length; i++) if (next[i] !== project.modified[i]) edit.push({ offset: i, before: project.modified[i], after: next[i] })
    if (!edit.length) return
    setHistory(h => [...h.slice(-199), edit]); setRedo([]); setByteValue(hex(next[byteOffset], 2))
    setSaveStatus('Saving locally…'); setProject({ ...project, modified: next, savedAt: new Date().toISOString() }); setNotice(label); setError('')
  }
  const undoEdit = (forward = false) => {
    if (!project) return
    const stack = forward ? redo : history, edit = stack.at(-1)
    if (!edit) return
    const bytes = project.modified.slice()
    for (const change of edit) bytes[change.offset] = forward ? change.after : change.before
    if (forward) { setRedo(r => r.slice(0, -1)); setHistory(h => [...h, edit]) }
    else { setHistory(h => h.slice(0, -1)); setRedo(r => [...r, edit]) }
    setByteValue(hex(bytes[byteOffset], 2))
    if (originalInfo?.system === 'SNES') { try { setTitle(analyzeRom(project.name, bytes).title) } catch { /* retain the edit field while a header is invalid */ } }
    setSaveStatus('Saving locally…'); setProject({ ...project, modified: bytes, savedAt: new Date().toISOString() }); setNotice(forward ? 'Edit reapplied.' : 'Edit undone.')
  }
  const safely = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  const size = tileBytes(format)
  const tileLimit = originalInfo?.system === 'NES' && originalInfo.chr ? originalInfo.chr.offset + originalInfo.chr.size : project?.modified.length ?? 0
  const tileStart = originalInfo?.system === 'NES' && originalInfo.chr ? originalInfo.chr.offset : originalInfo?.dataOffset ?? 0
  const tileCount = Math.max(0, Math.min(64, Math.floor((tileLimit - offset) / size)))
  const tileAddress = offset + selectedTile * size
  const pixels = project && tileCount && selectedTile < tileCount ? decodeTile(project.modified, tileAddress, format) : []
  const chooseOffset = (value: number) => { setOffset(value); setOffsetText(hex(value)); setSelectedTile(0) }
  const jumpTo = (value: number) => { setBytePage(Math.floor(value / 256) * 256); setByteOffset(value); setByteValue(hex(project!.modified[value], 2)); setJump(hex(value)) }
  const stem = project?.name.replace(/\.[^.]+$/, '') ?? 'cartridge'

  return <section className="rom-lab">
    <div className="rom-heading"><div><p className="eyebrow">CARTRIDGE WORKSHOP / NES + SUPER NES</p><h1 className="page-title">Open the cart.<br /><span>Make it yours.</span></h1><p className="hero-copy">Bring in a game you made. Inspect its structure, redraw its tiles,<br />and export a new version for your console or emulator.</p></div><div className="rom-chip" aria-hidden="true"><span>ROM</span><b>8 / 16</b><small>BIT WORKSHOP</small></div></div>
    <div className="rom-import" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void importFile(e.dataTransfer.files[0]) }}>
      <div><strong>INSERT YOUR CARTRIDGE</strong><p>Drop a .nes, .snes, .sfc or .smc file · up to 8 MiB + header</p><small>Files stay on this device. No API key needed.</small></div>
      <button className="btn-primary" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'Reading cartridge…' : '↑ Import ROM'}</button>
      <input ref={input} type="file" accept=".nes,.snes,.sfc,.smc" aria-label="Import NES or SNES ROM" className="sr-only" onChange={e => void importFile(e.target.files?.[0])} />
    </div>
    {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss ROM error" onClick={() => setError('')}>✕</button></div>}
    {projects.length > 0 && <div className="rom-projects" aria-label="Local ROM shelf">{projects.map(p => <button key={p.id} className={p.id === project?.id ? 'selected' : ''} disabled={loading} onClick={() => { setLoading(true); getRom(p.id).then(open).catch(e => setError(e.message)).finally(() => setLoading(false)) }}><span>{p.system}</span><strong>{p.name}</strong><small>{Math.round(p.size / 1024)} KiB · local project</small></button>)}</div>}
    {!project || !info ? <div className="rom-feature-grid"><article className="card"><span className="section-number">01</span><h2>Read the cartridge</h2><p>NES headers, mappers, PRG and CHR regions. SNES LoROM, HiROM and ExHiROM header detection.</p></article><article className="card"><span className="section-number">02</span><h2>Edit the details</h2><p>Paint graphics one pixel at a time. Inspect and patch bytes. Edit the SNES cartridge title.</p></article><article className="card"><span className="section-number">03</span><h2>Keep your original</h2><p>Save edits locally, undo changes and export a modified ROM or IPS patch against the original file.</p></article></div> : <div className="rom-workbench">
      <header className="rom-toolbar"><div><p className="eyebrow">{info.system} / {info.format}</p><h2>{project.name}</h2><p role="status">{saveStatus} · {changes.toLocaleString()} changed bytes</p></div><div className="rom-actions"><button className="btn-ghost" disabled={!history.length} onClick={() => undoEdit()}>↶ Undo</button><button className="btn-ghost" disabled={!redo.length} onClick={() => undoEdit(true)}>↷ Redo</button><button className="btn-ghost" onClick={() => download(project.original, project.name)}>↓ Original</button><button className="btn-ghost" onClick={() => safely(() => download(createIps(project.original, project.modified), `${stem}.ips`))}>↓ IPS patch</button><button className="btn-primary" onClick={() => { download(project.modified, project.name.replace(/(\.[^.]+)$/, '-edited$1')); exported.current = project }}>↓ Edited ROM</button></div></header>
      {notice && <p className="rom-save-note" role="status">{notice}</p>}
      {analysis.error && <div className="error-banner">Edited header is not recognized: {analysis.error} The map below uses the original header. Undo the header edit to restore detection.</div>}
      <div className="rom-tabs" role="tablist" aria-label="ROM tools">{(['overview', 'tiles', 'bytes'] as const).map(t => <button role="tab" id={`rom-tab-${t}`} aria-controls={`rom-panel-${t}`} aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{t === 'overview' ? '01 / Cartridge map' : t === 'tiles' ? '02 / Tile editor' : '03 / Hex editor'}</button>)}</div>
      <div role="tabpanel" id={`rom-panel-${tab}`} aria-labelledby={`rom-tab-${tab}`}>
      {tab === 'overview' && <div className="rom-panel"><div className="rom-stats"><div className="rom-stat"><small>FORMAT</small><strong>{info.format}</strong></div><div className="rom-stat"><small>MAPPING</small><strong>{info.mapping}</strong></div><div className="rom-stat"><small>FILE SIZE</small><strong>{(project.modified.length / 1024).toLocaleString()} KiB</strong></div><div className="rom-stat"><small>GRAPHICS</small><strong>{info.system === 'SNES' ? 'Locate in tile editor' : info.chr ? `${Math.floor(info.chr.size / 16)} CHR tiles` : 'CHR RAM'}</strong></div></div>
        <h3>Inside this cartridge</h3><div className="rom-section-list">{info.regions.map(r => <button key={r.name} onClick={() => { jumpTo(r.offset); setTab('bytes') }}><strong>{r.name}</strong><code>${hex(r.offset)} – ${hex(r.offset + r.size - 1)}</code><span>{r.size.toLocaleString()} bytes →</span></button>)}</div>
        {info.system === 'SNES' && <div className="rom-title-form"><label className="label" htmlFor="rom-title">Internal cartridge title (21 ASCII characters)</label><div className="rom-actions"><input className="input" id="rom-title" value={title} maxLength={21} onChange={e => setTitle(e.target.value)} /><button className="btn-ghost" onClick={() => safely(() => apply(setSnesTitle(project.modified, info, title), 'Cartridge title updated. Repair the checksum before export.'))}>Apply title</button><button className="btn-ghost" disabled={!info.canFixChecksum || !!analysis.error} onClick={() => safely(() => apply(repairSnesChecksum(project.modified, info), 'SNES checksum and complement repaired.'))}>Repair checksum</button></div><p className="rom-note">Stored checksum: ${hex(info.checksum!, 4)}. Editing any byte can change it; use Repair checksum before export. Repair is explicit and undoable.</p></div>}
        {info.warnings.map(w => <p className="rom-note" key={w}>▸ {w}</p>)}
      </div>}
      {tab === 'tiles' && <div className="rom-panel">
        {originalInfo?.system === 'NES' && !originalInfo.chr ? <p className="rom-note">This cartridge uses CHR RAM. There is no standalone CHR ROM to paint. Use the hex editor with your source/map file to locate graphics loaded by the program.</p> : <>
          <div className="rom-actions rom-tile-controls"><label>Graphics format<select className="input" value={format} onChange={e => { const f = e.target.value as TileFormat; setFormat(f); setSelectedTile(0); setColor(1) }} disabled={info.system === 'NES'}>{info.system === 'NES' ? <option value="nes">NES · 2bpp planar</option> : <><option value="snes2">SNES · 2bpp / 4 colors</option><option value="snes4">SNES · 4bpp / 16 colors</option><option value="snes8">SNES · 8bpp / 256 colors</option></>}</select></label><form onSubmit={e => { e.preventDefault(); safely(() => { const value = parseHex(offsetText, tileLimit - size); if (value < tileStart) throw new Error(`Graphics begin at $${hex(tileStart)}.`); chooseOffset(value) }) }}><label>File offset (hex)<input className="input" value={offsetText} onChange={e => setOffsetText(e.target.value)} aria-label="Tile file offset" /></label><button className="btn-ghost">Go</button></form></div>
          <p className="rom-note">{info.system === 'NES' ? 'CHR tiles are decoded directly from the graphics section.' : 'Choose the offset of known, uncompressed graphics from your source/map file. Random-looking tiles can be code or compressed data.'} Colors below are a preview palette; painting changes the pixel index, not the game’s palette.</p>
          <TileSheet bytes={project.modified} offset={offset} format={format} count={tileCount} selected={selectedTile} choose={setSelectedTile} />
          <div className="rom-actions"><button className="btn-ghost" disabled={offset - size * 64 < tileStart} onClick={() => chooseOffset(Math.max(tileStart, offset - size * 64))}>← Previous tiles</button><label>Tile number on page <input type="number" min={0} max={Math.max(0, tileCount - 1)} value={selectedTile} onChange={e => setSelectedTile(Math.max(0, Math.min(tileCount - 1, Number(e.target.value) || 0)))} /></label><button className="btn-ghost" disabled={offset + size * 64 + size > tileLimit} onClick={() => chooseOffset(offset + size * 64)}>Next tiles →</button></div>
          <div className="rom-paint"><div><h3>Paint tile at ${hex(tileAddress)}</h3><div className="rom-tile-grid" aria-label="Editable 8 by 8 tile">{pixels.map((value, i) => <button key={i} style={{ background: previewColor(value) }} title={`Pixel ${i % 8 + 1}, ${Math.floor(i / 8) + 1}: index ${value}`} aria-label={`Paint pixel ${i % 8 + 1}, ${Math.floor(i / 8) + 1}`} onClick={() => safely(() => apply(paintPixel(project.modified, tileAddress, format, i, color), `Painted tile at $${hex(tileAddress)}. Original ROM preserved.`))} />)}</div></div><div><h3>Brush / palette index {color}</h3><div className="rom-palette">{Array.from({ length: Math.min(16, 2 ** tileBits(format)) }, (_, i) => <button key={i} className={color === i ? 'selected' : ''} style={{ background: previewColor(i), color: i === 0 ? '#fff' : '#000' }} aria-label={`Use color index ${i}`} aria-pressed={color === i} onClick={() => setColor(i)}>{i}</button>)}</div>{format === 'snes8' && <label className="label">Palette index (0–255)<input type="number" className="input" min={0} max={255} value={color} onChange={e => setColor(Math.max(0, Math.min(255, Number(e.target.value) || 0)))} /></label>}<p className="rom-note">Click a color, then a pixel. Undo restores the affected bytes. Tile changes are saved to your local ROM project.</p></div></div>
        </>}
      </div>}
      {tab === 'bytes' && <div className="rom-panel"><div className="rom-actions"><form onSubmit={e => { e.preventDefault(); safely(() => jumpTo(parseHex(jump, project.modified.length - 1))) }}><label>Jump to file offset (hex)<input className="input" value={jump} onChange={e => setJump(e.target.value)} aria-label="Hex file offset" /></label><button className="btn-ghost">Go to byte</button></form><form onSubmit={e => { e.preventDefault(); safely(() => { const next = project.modified.slice(); next[byteOffset] = parseHex(byteValue, 255); apply(next, `Changed byte at $${hex(byteOffset)}.`) }) }}><label>Byte at ${hex(byteOffset)}<input className="input" value={byteValue} onChange={e => setByteValue(e.target.value)} maxLength={4} aria-label="Hex byte value" /></label><button className="btn-primary">Apply byte</button></form></div><p className="rom-note">Offsets are file offsets, including any header. Highlighted bytes differ from your original. Code and data share this view; use your build’s symbol/map file to identify them.</p>
        <div className="rom-hex-scroll"><table className="rom-hex-table"><thead><tr><th>OFFSET</th>{Array.from({ length: 16 }, (_, i) => <th key={i}>{hex(i, 1)}</th>)}</tr></thead><tbody>{Array.from({ length: Math.min(16, Math.ceil((project.modified.length - bytePage) / 16)) }, (_, row) => <tr key={row}><th>{hex(bytePage + row * 16)}</th>{Array.from({ length: 16 }, (_, col) => { const at = bytePage + row * 16 + col; return <td key={col}>{at < project.modified.length && <button className={`rom-hex-byte ${project.original[at] !== project.modified[at] ? 'changed' : ''} ${byteOffset === at ? 'selected' : ''}`} aria-label={`Byte ${hex(at)}: ${hex(project.modified[at], 2)}`} onClick={() => { setByteOffset(at); setByteValue(hex(project.modified[at], 2)) }}>{hex(project.modified[at], 2)}</button>}</td> })}</tr>)}</tbody></table></div><div className="rom-actions"><button className="btn-ghost" disabled={!bytePage} onClick={() => jumpTo(bytePage - 256)}>← Previous bytes</button><span>${hex(bytePage)} / ${hex(project.modified.length - 1)}</span><button className="btn-ghost" disabled={bytePage + 256 >= project.modified.length} onClick={() => jumpTo(bytePage + 256)}>Next bytes →</button></div>
      </div>}
      </div>
    </div>}
    <p className="rom-scope"><b>What this workshop can do:</b> inspect and edit cartridge bytes and uncompressed tiles. It does not recover source code, automatically rebuild level editors, or run an NES/SNES emulator. Export your ROM to test in your existing emulator. Local projects are separate from generated browser games; download a copy before clearing browser data. IPS patches require the exact original file, including its copier header.</p>
  </section>
}
