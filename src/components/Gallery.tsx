import { SpriteSheet } from './SpriteSheet'
import { useEffect, useState } from 'react'
import { apiUrl, getGame, listGames, mutate } from '../api/generate'
import { getMold } from '../model/molds'
import type { Cartridge } from '../model/types'
import { useStudio } from '../studio'

export function Gallery() {
  const studio = useStudio()
  const [sprites, setSprites] = useState<Cartridge | null>(null)
  const [scope, setScope] = useState<'mine' | 'community'>('mine')
  const [games, setGames] = useState<Cartridge[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [more, setMore] = useState(false)
  const [onlySaved, setOnlySaved] = useState(false)
  const [saved, setSaved] = useState<string[]>(() => { try { const value: unknown = JSON.parse(localStorage.getItem('moldforge.favorites') || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [] } catch { return [] } })
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listGames(scope).then(result => { if (!cancelled) { setGames(result.games); setMore(result.hasMore) } }).catch(e => { if (!cancelled) studio.setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // The revision deliberately refreshes after a generation or visibility change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, studio.revision])
  const toggleSaved = (id: string) => {
    const next = saved.includes(id) ? saved.filter(s => s !== id) : [...saved, id]
    setSaved(next)
    try { localStorage.setItem('moldforge.favorites', JSON.stringify(next)) } catch { studio.setError('Browser storage is full. Download the cartridge to keep a copy.') }
  }
  const action = async (id: string, type: 'publish' | 'delete' | 'remix', published = false) => {
    if (!studio.config) return
    if (type === 'delete' && !confirm('Delete this cartridge from the server? Download it first if you want a copy.')) return
    setPending(id); studio.setError(null)
    try {
      if (type === 'remix') studio.remix((await getGame(id)).template)
      else { await mutate(type, { id, published }, studio.config.csrf); studio.refresh() }
    } catch (e) { studio.setError((e as Error).message) }
    finally { setPending(null) }
  }
  const filtered = games.filter(g => (!onlySaved || saved.includes(g.id)) && `${g.title} ${g.pitch}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="gallery-view">
    {sprites && <SpriteSheet game={sprites} close={() => setSprites(null)} />}
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">THE CARTRIDGE CLUB</p><h1 className="page-title">Small worlds.<br /><span>Big adventures.</span></h1><p className="mt-3 max-w-xl text-sm text-zinc-400">Your games live here. Pick one up, press start, and make it a little further than last time.</p></div><div className="flex items-center gap-3"><button className="btn-primary" disabled={studio.busy} onClick={studio.newGame}>＋ New game</button><span className="shelf-label">{games.length.toString().padStart(2, '0')} CARTRIDGES</span></div></div>
    <div className="gallery-toolbar"><div className="flex flex-wrap gap-2"><button className={scope === 'mine' ? 'tab active' : 'tab'} onClick={() => setScope('mine')}>My cartridges</button><button className={scope === 'community' ? 'tab active' : 'tab'} onClick={() => setScope('community')}>Community arcade</button><button className={onlySaved ? 'tab active' : 'tab'} onClick={() => setOnlySaved(!onlySaved)}>♥ Saved</button></div><input aria-label="Search cartridges" className="input max-w-xs" placeholder="Find your next adventure…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    {loading ? <p className="empty-shelf">Loading your shelf…</p> : filtered.length === 0 ? <div className="empty-shelf"><div className="empty-icon">▣</div><h2>{query || onlySaved ? 'No matching cartridges' : scope === 'mine' ? 'Your first adventure belongs here.' : 'The arcade is waiting for its first game.'}</h2><p>{scope === 'mine' ? 'Build a game in the studio, or load the example and try the free starter.' : 'Publish a finished cartridge from your shelf to share it here.'}</p></div> : <div className="cartridge-grid">{filtered.map((g, i) => <article className={`cartridge color-${i % 4}`} key={g.id}>
      <div className="cart-ridges" /><div className="cart-label"><div className="cart-label-top"><span>{g.provider === 'starter' ? 'STARTER EDITION' : g.provider === 'anthropic' ? 'CLAUDE ORIGINAL' : 'OPENAI ORIGINAL'}</span><button className={saved.includes(g.id) ? 'heart selected' : 'heart'} aria-label={saved.includes(g.id) ? `Unsave ${g.title}` : `Save ${g.title}`} onClick={() => toggleSaved(g.id)}>♥</button></div>
        <div className="cart-art">{g.hasArt ? <img loading="lazy" src={apiUrl('art', g.id)} alt={`Generated sprite sheet for ${g.title}`} /> : <div className="pixel-landscape"><span className="pixel-moon" /><span className="pixel-hill one" /><span className="pixel-hill two" /><span className="pixel-hero" /><span className="pixel-star">✦</span></div>}<span className="cart-genre">{getMold(g.perspective)?.name}</span></div>
        <div className="cart-details">{g.codeModel && <p className="cart-model">{g.codeModel}{g.arenaId ? ' · Arena' : ''}</p>}<h2>{g.title}</h2><p>{g.pitch}</p><div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-zinc-400"><span>{g.levelCount} stages</span><span>·</span><span>{g.artStyle}</span><span>·</span><span>{g.published ? 'Public' : 'Private'}</span></div></div>
      </div><div className="cart-actions">{g.state === 'ready' ? <button className="btn-primary grow justify-center" onClick={() => studio.play(g)}>▶ Play cartridge</button> : <button className="btn-primary grow justify-center" disabled={studio.busy} onClick={() => studio.generate(false, g.id)}>↻ {g.state === 'testing' ? 'Test cartridge' : g.state === 'code' ? 'Finish artwork' : 'Resume generation'}</button>}<button className="btn-ghost" disabled={pending === g.id} onClick={() => action(g.id, 'remix')}>Remix</button></div>
      {g.owned && g.state === 'testing' && g.error && <button className="btn-ghost mx-4" disabled={studio.busy} onClick={() => studio.generate(false, g.id, false, true)}>Repair &amp; test · uses API</button>}
      {g.error && <p className="px-4 pb-2 text-xs text-amber-300">{g.error}</p>}
      <div className="cart-meta">{g.hasArt && <button onClick={() => setSprites(g)}>View sprites</button>}{g.state === 'ready' && <a href={apiUrl('download', g.id)} download>↓ Download HTML</a>}{g.owned && <><button disabled={pending === g.id || g.state !== 'ready'} onClick={() => action(g.id, 'publish', !g.published)}>{g.published ? 'Unpublish' : 'Publish to arcade'}</button><button disabled={pending === g.id || studio.busy} onClick={() => action(g.id, 'delete')}>Delete</button></>}{g.owned && g.state === 'code' && <button disabled={studio.busy} onClick={() => studio.generate(false, g.id, true)}>Finish without art</button>}</div>
    </article>)}</div>}
    {more && <button className="btn-ghost mt-6" onClick={async () => { try { const result = await listGames(scope, games.length); setGames([...games, ...result.games]); setMore(result.hasMore) } catch (e) { studio.setError((e as Error).message) } }}>Load more</button>}
    <p className="mt-8 text-xs leading-relaxed text-zinc-500">Your private shelf is linked to this browser’s cookie. Download your HTML cartridges to keep permanent copies. Publishing makes a game and its template visible to everyone in this arcade. Saved hearts and checkpoints stay in this browser.</p>
  </div>
}
