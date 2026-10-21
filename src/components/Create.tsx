import { useStudio } from '../studio'
import { AiPlanner } from './AiPlanner'
import type { WizardState } from '../model/wizard'

export function Create({ state, startNew, continueDraft, openRoms }: { state: WizardState; startNew: () => void; continueDraft: () => void; openRoms: () => void }) {
  const studio = useStudio()
  const hasDraft = !!(state.template.gameTitle || state.template.characters.length || state.template.levels.length)
  return <section className="create-view">
    <p className="eyebrow">A FRESH CARTRIDGE. A NEW ADVENTURE.</p>
    <h1 className="page-title">What are we<br /><span>making next?</span></h1>
    <p className="mt-5 max-w-xl text-sm leading-relaxed text-zinc-400">Describe it below and generate a playable game in one click. Or open the manual builder to shape every detail.</p>
    <AiPlanner />
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <article className="idea-card"><span className="section-number mb-5">＋</span><h2 className="text-xl font-bold">A brand-new game</h2><p className="my-4 text-sm leading-relaxed text-zinc-400">New title, new characters, new levels. A clean slate for your next idea.</p><button className="btn-primary" disabled={studio.busy} onClick={startNew}>Start new game →</button></article>
      {hasDraft && <article className="starter-card"><p className="eyebrow">YOUR CURRENT DRAFT</p><h2>{state.template.gameTitle || 'Untitled game'}</h2><p>{state.template.pitch || 'Your saved work is ready when you are.'}</p><button className="btn-ghost" disabled={studio.busy} onClick={continueDraft}>Continue this draft →</button></article>}
    </div>
    <div className="rom-create-link"><div><b>Already built a cartridge?</b><p>Open your NES or SNES ROM in the workshop. Inspect, edit tiles and export a new version.</p></div><button className="btn-ghost" disabled={studio.busy} onClick={openRoms}>Open ROM Lab →</button></div>
  </section>
}
