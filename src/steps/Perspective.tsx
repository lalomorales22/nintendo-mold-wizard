import { MOLDS } from '../model/molds'
import { StepHeader } from '../components/ui'
import type { StepProps } from './types'

export function Perspective({ state, dispatch }: StepProps) {
  const sel = state.template.perspective
  return (
    <div>
      <StepHeader kicker="Step 2 · Perspective mold" title="How does the player see the world?">
        Each mold brings its own camera, core verbs, level shape and character stats. You can switch later; stats re-key automatically.
      </StepHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MOLDS.map((m) => {
          const active = m.id === sel
          return (
            <button key={m.id} type="button" onClick={() => dispatch({ type: 'setPerspective', id: m.id })}
              className={`card text-left transition hover:border-zinc-600 ${active ? 'border-cart-red! ring-2 ring-cart-red/40' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white">{m.name}</h3>
                <span className="chip">{m.dimensions}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">{m.tagline}</p>
              <dl className="mt-3 space-y-1 text-xs text-zinc-500">
                <div><dt className="inline text-zinc-400">Camera: </dt><dd className="inline">{m.defaultCamera}</dd></div>
                <div><dt className="inline text-zinc-400">Levels: </dt><dd className="inline">{m.levelShape}</dd></div>
                <div><dt className="inline text-zinc-400">Verbs: </dt><dd className="inline">{m.coreVerbs.join(', ')}</dd></div>
                <div><dt className="inline text-zinc-400">Like: </dt><dd className="inline">{m.examples.join(' · ')}</dd></div>
              </dl>
            </button>
          )
        })}
      </div>
    </div>
  )
}
