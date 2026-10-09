import { Field, StepHeader } from '../components/ui'
import type { StepProps } from './types'

export function Welcome({ state, dispatch }: StepProps) {
  const t = state.template
  return (
    <div>
      <StepHeader kicker="Step 1 · Welcome" title="Forge a game from a classic mold">
        Every console-era game sits on a handful of repeatable molds: a perspective, a cast, a set of levels, and the knobs
        that make it feel right. Fill in the mold step by step and Moldforge generates the whole game from that template.
      </StepHeader>
      <div className="card grid gap-4 md:max-w-xl">
        <Field label="Game title">
          <input className="input" autoFocus value={t.gameTitle} placeholder="e.g. Charge Quest"
            onChange={(e) => dispatch({ type: 'setMeta', patch: { gameTitle: e.target.value } })} />
        </Field>
        <Field label="One-line pitch" hint="What is the game about, in one sentence?">
          <textarea className="input min-h-20" value={t.pitch} placeholder="A Tesla driver crosses the border at midnight hunting for cheap electrons."
            onChange={(e) => dispatch({ type: 'setMeta', patch: { pitch: e.target.value } })} />
        </Field>
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        Just looking? <button type="button" className="text-cart-red hover:underline" onClick={() => dispatch({ type: 'loadExample' })}>Load the example game</button> and click through every step.
      </p>
      <ol className="mt-8 grid gap-3 text-sm text-zinc-400 md:grid-cols-4">
        {['Pick a perspective mold', 'Build your cast', 'Lay out levels', 'Tune parameters, then generate'].map((s, i) => (
          <li key={s} className="rounded-lg border border-zinc-800 p-3"><span className="mr-2 font-mono text-cart-red">{i + 2}</span>{s}</li>
        ))}
      </ol>
    </div>
  )
}
