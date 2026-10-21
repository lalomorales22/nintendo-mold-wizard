import { useStudio } from '../studio'
import { QuickBuild } from '../components/QuickBuild'
import { Field } from '../components/ui'
import type { StepProps } from './types'

export function Welcome({ state, dispatch }: StepProps) {
  const studio = useStudio()
  const t = state.template
  return <div className="welcome-view">
    <div className="hero-heading">
      <div>
        <p className="eyebrow">Game-Maker · HOME GAME DEVELOPMENT SYSTEM</p>
        <h1 className="page-title">Big ideas.<br /><span>8-bit beginnings.</span></h1>
        <p className="hero-copy">The cartridge you always wanted to play.<br className="hidden md:block" /> Make a world, build your heroes, and press start.</p>
        <span className="insert-credit"><i /> PLAYER 1 · READY TO CREATE</span>
      </div>
      <div className="hero-console-scene" aria-hidden="true">
        <div className="hero-cartridge">
          <div className="hero-cart-lines" />
          <div className="hero-cart-label"><span>Game-Maker ORIGINAL</span><div className="pixel-landscape"><span className="pixel-moon" /><span className="pixel-hill one" /><span className="pixel-hill two" /><span className="pixel-hero" /><span className="pixel-star">✦</span></div><strong>YOUR NEXT<br />ADVENTURE</strong><small>ONE GOOD IDEA · INFINITE CONTINUES</small></div>
          <div className="hero-cart-notch" />
        </div>
        <div className="hero-controller"><div className="controller-face"><div className="controller-dpad" /><div className="controller-center"><span>SELECT &nbsp; START</span><i /><i /></div><div className="controller-buttons"><span>B</span><span>A</span></div></div></div>
      </div>
    </div>
    <div className="welcome-grid"><section className="idea-card"><div className="flex items-center gap-3"><span className="section-number">01</span><div><h2 className="text-lg font-bold">Insert your idea.</h2><p className="text-xs text-zinc-400">A name, a world, a slightly ridiculous adventure.</p></div></div><div className="mt-6 grid gap-5"><Field label="What’s your game called?"><input className="input" autoFocus maxLength={100} value={t.gameTitle} placeholder="e.g. Midnight Moon Delivery" onChange={e => dispatch({ type: 'setMeta', patch: { gameTitle: e.target.value } })} /></Field><Field label="Describe your game" hint="A paragraph is enough. Include your hero, world, controls and goal."><textarea className="input min-h-28" maxLength={3000} value={t.pitch} placeholder="A tiny space courier hops across rooftop gardens to deliver the last letter on the moon." onChange={e => dispatch({ type: 'setMeta', patch: { pitch: e.target.value } })} /></Field><QuickBuild prompt={(t.gameTitle ? t.gameTitle + ": " : "") + t.pitch} disabled={studio.busy || t.pitch.trim().length < 10} /></div></section>
    <aside className="starter-card"><span className="tiny-stars">★ ★ ★</span><p className="eyebrow">PACK-IN GAME INCLUDED</p><h2>Meet Charge Quest.</h2><p>A midnight driver. A nearly dead battery. One last chance to make it home.</p><div className="starter-tags"><span>2D PLATFORMER</span><span>2 STAGES</span><span>LOTS OF HEART</span></div><button className="btn-ghost w-full justify-center" onClick={() => dispatch({ type: 'loadExample' })}>Load the example game ↗</button><small>Ready to customize. Play the free starter at Review.</small></aside></div>
    <div className="how-it-works">{[['01','Design your adventure','Pick a mold, cast your heroes, set the scene.'],['02','Build it with OpenAI','Generate playable code and original game art.'],['03','Press start','Play, save, remix, download. It’s yours.']].map(([n,title,copy]) => <div key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></div>)}</div>
    <p className="scope-note">Create original browser games here. Bring your own NES / SNES cartridges to ROM Lab.</p>
  </div>
}
