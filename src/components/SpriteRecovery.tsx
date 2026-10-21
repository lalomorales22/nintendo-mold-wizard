import { useEffect, useRef, useState } from 'react'
import { apiUrl, getConfig, mutate } from '../api/generate'
import { validateGame } from '../api/validate'
import type { Cartridge } from '../model/types'
import { useStudio } from '../studio'

export function SpriteRecovery({ game, close }: { game: Cartridge; close: () => void }) {
  const studio = useStudio(), dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false), [applied, setApplied] = useState(false), [error, setError] = useState('')
  useEffect(() => { const node=dialog.current; node?.showModal(); return () => node?.close() }, [])
  const recover = async () => {
    setBusy(true); setError('')
    try {
      const config = await getConfig()
      await mutate('recover-art', { id: game.id }, config.csrf)
      setApplied(true)
      const fitted = await validateGame(game.id, config.csrf)
      close(); studio.play(fitted)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false); studio.refresh() }
  }
  return <dialog className="sprite-dialog" ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) close() }} aria-labelledby="recovery-title">
    <header><div><p className="eyebrow">RECOVER YOUR SAVED ART</p><h2 id="recovery-title">{game.title}</h2></div><button className="btn-ghost" disabled={busy} onClick={close}>Close</button></header>
    <p className="sprite-description">This is the original image saved when fitting failed. The fitter can separate close sprites and unfold a compact boss block into the game’s grid. It keeps whole silhouettes and the original source; it cannot invent missing poses or verify which way a character faces.</p>
    <div className="sprite-recovery-source"><img src={apiUrl('source-art',game.id)} alt={`Saved source artwork for ${game.title}`} /></div>
    <div className="flex flex-wrap gap-3 mt-4"><button className="btn-primary" disabled={busy || studio.busy || applied} onClick={() => void recover()}>{busy ? 'Fitting sprites and testing…' : applied ? 'Artwork fitted' : 'Fit saved artwork · free'}</button><a className="btn-ghost" href={apiUrl('source-art',game.id)} download={`${game.id}-source.png`}>↓ Download source PNG</a></div>
    <p className="sprite-description">No API call or credits. Successful fitting tests and opens this same cartridge. Check its animation in Gallery → View sprites. If the source is incomplete or still overlaps, your code and source stay saved.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
  </dialog>
}
