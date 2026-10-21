import { useEffect, useRef, useState } from 'react'
import { useStudio } from '../studio'
import { apiUrl } from '../api/generate'
import type { Cartridge } from '../model/types'

export function Player({ game, close }: { game: Cartridge; close: () => void }) {
  const studio = useStudio()
  const frame = useRef<HTMLIFrameElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveKey = `moldforge.save.${game.id}`
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return
      if (event.data.type === 'moldforge-ready') {
        setReady(true)
        try { const raw = localStorage.getItem(saveKey); if (raw) frame.current?.contentWindow?.postMessage({ type: 'moldforge-restore', checkpoint: JSON.parse(raw) }, '*') } catch { /* unavailable storage */ }
      }
      if (event.data.type === 'moldforge-save') {
        try { const value = JSON.stringify(event.data.checkpoint); if (value && value.length < 32000) { localStorage.setItem(saveKey, value); setSaved(true) } } catch { setSaved(false) }
      }
      if (event.data.type === 'moldforge-error') { window.clearTimeout(timer); setError(current => current || (typeof event.data.message === 'string' ? event.data.message.slice(0, 400) : 'The cartridge stopped unexpectedly.')) }
    }
    window.addEventListener('message', receive)
    const timer = window.setTimeout(() => setReady(current => { if (!current) setError('The cartridge is taking longer to start. Try reopening it; if it still fails, remix the template and regenerate.'); return current }), 25000)
    return () => { window.removeEventListener('message', receive); window.clearTimeout(timer) }
  }, [saveKey])
  return <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`Play ${game.title}`} ref={container}>
    <div className="player-shell">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="eyebrow">NOW PLAYING</p><h2 className="text-xl font-bold">{game.title}</h2></div><div className="flex gap-2"><button className="btn-ghost" onClick={() => { container.current?.requestFullscreen?.().catch(() => setError('Fullscreen is unavailable in this browser.')) }}>Expand</button><a className="btn-ghost" href={apiUrl('download', game.id)} download>↓ HTML</a><button className="btn-primary" autoFocus onClick={close}>Close</button></div></header>
      {error && <div className="error-banner mx-4" role="alert">{error} {game.owned && <button className="btn-primary" disabled={studio.busy} onClick={() => { close(); void studio.generate(false, game.id, false, error) }}>Repair &amp; test · uses API</button>}</div>}
      <iframe ref={frame} className="game-frame" src={apiUrl('play', game.id)} sandbox="allow-scripts" title={game.title} allow="fullscreen" />
      <footer className="flex flex-wrap justify-between gap-2 px-5 py-3 text-xs text-zinc-400"><span>{ready ? 'Keyboard + touch controls · P pause · R restart' : 'Starting cartridge…'}</span><span>{saved ? '✓ Checkpoint saved in this browser' : 'Checkpoints save automatically during play'}</span></footer>
    </div>
  </div>
}
