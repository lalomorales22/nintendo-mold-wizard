import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { QuickBuild } from './QuickBuild'
import { getConfig, mutate } from '../api/generate'
import { planToTemplate, type GamePlan, type TileReference } from '../model/plan'
import { getMold } from '../model/molds'
import { useStudio } from '../studio'
import '../rom/rom.css'

export function AiPlanner({ reference, sourceKey = 'idea' }: { reference?: TileReference; sourceKey?: string }) {
  const studio = useStudio()
  const [prompt, setPrompt] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ key: string; plan: GamePlan } | null>(null)
  const key = JSON.stringify([sourceKey, reference, prompt])
  const latest = useRef(key), running = useRef(false)
  const plan = result?.key === key ? result.plan : null
  useLayoutEffect(() => { latest.current = key; return () => { latest.current = '' } }, [key])
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  const analyze = async () => {
    if (running.current) return
    running.current = true; setBusy(true); setError(''); setResult(null)
    const snapshot = key
    try {
      const config = await getConfig()
      if (!studio.apiKey.trim() && !config.serverKeyAvailable) {
        studio.setSettingsOpen(true)
        throw new Error('Connect your OpenAI key, then create the plan. Your current editor draft is kept until you choose Use this plan.')
      }
      const plan = await mutate<GamePlan>('plan', { prompt, reference }, config.csrf, studio.apiKey)
      if (latest.current === snapshot) setResult({ key: snapshot, plan })
    } catch (e) { if (latest.current === snapshot) setError((e as Error).message) }
    finally { running.current = false; setBusy(false) }
  }
  return <section className="ai-planner card">
    <p className="eyebrow">IDEA → GAME PLAN → PLAY</p><h2>One idea. Press start.</h2>
    <p className="rom-note">A game is a <b>character</b> with <b>abilities</b>, in a <b>world</b> with <b>obstacles, rewards and rules</b>. Tell us what you want; AI fills in the details and builds it.</p>
    {reference && <figure className="ai-reference"><img src={reference.image} alt="The current decoded tile page to include in the AI plan" /><figcaption>{reference.label}<br />Preview colors. Tile roles and gameplay are AI proposals for you to review.</figcaption></figure>}
    <label className="label" htmlFor={`ai-idea-${sourceKey === 'idea' ? 'new' : 'rom'}`}>What should the new game be?</label>
    <textarea id={`ai-idea-${sourceKey === 'idea' ? 'new' : 'rom'}`} className="input" disabled={studio.busy} rows={4} maxLength={3000} value={prompt} onChange={e => { setPrompt(e.target.value); setError('') }} placeholder="A penguin boxer fights through three icy arenas. Z punches, X blocks. Win each round to face a bigger rival. Use chunky pixel art and make it easy to learn." />
    <p className="rom-note">{reference ? 'Sends this tile page, its format/offset label and your description to OpenAI. Your ROM file stays local.' : 'Sends your description to OpenAI.'} Builds an original browser game.</p>
    <QuickBuild prompt={prompt} reference={reference} disabled={busy || studio.busy || prompt.trim().length < 10} />
    <button className="btn-ghost mt-4" disabled={busy || studio.busy || prompt.trim().length < 10} onClick={() => void analyze()}>{busy ? 'Analyzing and planning…' : 'Just make a plan first →'}</button>
    {busy && <p role="status" className="rom-note">Your plan is being written. Changes to the idea or tiles discard this request’s result.</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {plan && <div className="ai-plan-result">
      <p className="eyebrow">REVIEW YOUR PROPOSED GAME</p><h3>{plan.title}</h3><p>{plan.pitch}</p><p className="rom-note">{getMold(plan.perspective)?.name} · {plan.levels.length} stages</p>
      <div className="ai-plan-grid"><article><h4>Character + abilities</h4><p><b>{plan.hero.name}</b> — {plan.hero.description}</p><p><b>{plan.hero.ability}</b> — {plan.hero.abilityDescription}</p><p>Rival: {plan.enemy.name}. {plan.enemy.description}</p></article><article><h4>World + rules</h4><p>{plan.coreLoop}</p><p><b>Win:</b> {plan.win}</p><p><b>Lose:</b> {plan.lose}</p></article></div>
      <h4>Your stages</h4><ol>{plan.levels.map((level, i) => <li key={i}><b>{level.name}</b> — {level.layout} <em>Goal: {level.goal}</em></li>)}</ol>
      <h4>Visual direction</h4><p>{plan.visualStyle}</p>
      <details><summary>Evidence and AI assumptions</summary><p><b>Observed:</b> {plan.observations}</p><p><b>Proposed:</b> {plan.assumptions}</p></details>
      <button className="btn-primary" disabled={studio.busy} onClick={() => studio.remix(planToTemplate(plan, reference))}>Use this plan in the builder →</button>
      <p className="rom-note">Review or edit any detail in the builder, then Generate. Planning and game generation are separate API requests.</p>
    </div>}
  </section>
}
