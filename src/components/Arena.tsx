import { useEffect, useState } from 'react'
import { apiUrl, getConfig, listArenas, mutate } from '../api/generate'
import type { ArenaMatch } from '../model/types'
import { useStudio } from '../studio'
import { ModelInput } from './ModelPicker'

export function Arena() {
  const s = useStudio()
  const [prompt, setPrompt] = useState('')
  const [matches, setMatches] = useState<ArenaMatch[]>([])
  const [selected, setSelected] = useState<string | null>(s.arenaId)
  const [voting, setVoting] = useState(false)
  useEffect(() => { if (s.arenaId) setSelected(s.arenaId) }, [s.arenaId])
  useEffect(() => {
    let cancelled = false
    listArenas().then(r => { if (!cancelled) setMatches(r.arenas) }).catch(e => { if (!cancelled) s.setError(e.message) })
    return () => { cancelled = true }
    // Refresh after each saved generation step, without restarting the arena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.revision])
  const match = matches.find(m => m.id === selected) ?? matches[0]
  const complete = match?.games.length === 2 && match.games.every(g => g.state === 'ready')
  const vote = async (winner: 'openai' | 'anthropic' | 'tie') => {
    if (!match) return
    setVoting(true)
    try { const config = await getConfig(); await mutate('arena-vote', { id: match.id, winner }, config.csrf); s.refresh() }
    catch (e) { s.setError((e as Error).message) } finally { setVoting(false) }
  }
  return <div className="arena-view">
    <p className="eyebrow">PLAYER ONE VS PLAYER TWO</p><h1 className="page-title">Same idea.<br /><span>Two contenders.</span></h1>
    <p className="arena-intro">OpenAI and Claude each plan and build your game. Play both cartridges, then pick your winner. Every finished game also lives in your gallery.</p>
    <section className="card arena-setup"><label className="label" htmlFor="arena-prompt">The challenge</label>
      <textarea id="arena-prompt" className="input" rows={4} maxLength={3000} disabled={s.busy} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Build a fast little penguin racing game with icy corners, fish power-ups and a rival who gets faster each lap…" />
      <div className="arena-models"><ModelInput provider="openai" value={s.openaiModel} onChange={s.setOpenaiModel} disabled={s.busy}/><span className="arena-vs" aria-hidden="true">VS</span><ModelInput provider="anthropic" value={s.anthropicModel} onChange={s.setAnthropicModel} disabled={s.busy}/></div>
      <label className="quick-art"><input type="checkbox" checked={s.withArt} onChange={e => s.setWithArt(e.target.checked)} disabled={s.busy}/> OpenAI sprite artwork for both games</label>
      <div className="flex flex-wrap gap-3 mt-4"><button className="btn-primary launch-button" disabled={s.busy || prompt.trim().length < 10} onClick={() => void s.battle(prompt)}>⚔ Start a new battle</button><button className="btn-ghost" onClick={() => s.setSettingsOpen(true)}>Connect providers</button></div>
      <p className="rom-note">Uses both API accounts. Two independent builds run one after the other; artwork adds two OpenAI image requests. Your API credits apply through the account that issued each key. Failed rounds wait for you to resume or repair them.</p>
    </section>
    {matches.length > 0 && <section className="arena-match">
      <div className="arena-match-heading"><h2>Saved battles</h2><label className="label">Choose a match<select className="input" value={match?.id ?? ''} onChange={e => setSelected(e.target.value)}>{matches.map(m => <option key={m.id} value={m.id}>{m.prompt.slice(0, 70)} · {new Date(m.createdAt).toLocaleDateString()}</option>)}</select></label></div>
      {match && <><p className="arena-challenge">{match.prompt}</p><div className="arena-contenders">{(['openai', 'anthropic'] as const).map((provider, index) => {
        const game = match.games.find(g => g.provider === provider)
        const status = game?.state === 'ready' ? 'Saved · ready to play' : match.id === s.arenaId ? s.arenaProgress[provider] : undefined
        return <article className={`arena-fighter fighter-${provider}`} key={provider}>
          <div className="arena-player">PLAYER 0{index + 1} {match.winner === provider && <span>★ YOUR WINNER</span>}</div>
          <h3>{provider === 'anthropic' ? 'Claude' : 'OpenAI'}</h3><p className="arena-model-id">{match.settings[provider]}</p>
          {game?.hasArt && <img className="arena-art" src={apiUrl('art', game.id)} alt={`${game.title} sprite sheet`}/>}
          <h4>{game?.title ?? 'Waiting to build'}</h4><p>{game?.pitch ?? 'This contender will create its own plan from the challenge.'}</p>
          <p className="arena-round-status" role="status">{status ?? (game?.state === 'ready' ? 'Saved · ready to play' : game?.error || (game ? `Saved ${game.state} · resume to continue` : 'Not built yet'))}</p>
          {game?.state === 'ready' && <button className="btn-primary" onClick={() => s.play(game)}>▶ Play {provider === 'anthropic' ? 'Claude' : 'OpenAI'} game</button>}
          {game?.state === 'testing' && game.error && <button className="btn-ghost" disabled={s.busy} onClick={() => s.generate(false, game.id, false, true)}>Repair &amp; test · uses API</button>}
        </article>
      })}</div>
      {!complete && <button className="btn-primary mt-4" disabled={s.busy} onClick={() => s.battle(match.prompt, match.id)}>↻ Resume unfinished rounds</button>}
      {complete && <div className="arena-vote"><h3>{match.winner ? `Your verdict: ${match.winner === 'tie' ? 'a tie!' : match.winner === 'anthropic' ? 'Claude wins!' : 'OpenAI wins!'}` : 'Play both. Pick your winner.'}</h3><p>Your vote is saved with this match.</p><div className="flex flex-wrap gap-3 mt-3"><button className="btn-ghost" disabled={voting || s.busy} onClick={() => vote('openai')}>OpenAI wins</button><button className="btn-ghost" disabled={voting || s.busy} onClick={() => vote('anthropic')}>Claude wins</button><button className="btn-ghost" disabled={voting || s.busy} onClick={() => vote('tie')}>Call it a tie</button></div></div>}
      </>}
    </section>}
  </div>
}
