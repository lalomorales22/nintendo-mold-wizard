import { useEffect, useReducer } from 'react'
import { loadState, saveState } from './model/storage'
import { blockReason, progress, STEP_LABELS, stepIndex, STEPS, wizardReducer, type StepId } from './model/wizard'
import { Characters } from './steps/Characters'
import { Levels } from './steps/Levels'
import { Parameters } from './steps/Parameters'
import { Perspective } from './steps/Perspective'
import { Review } from './steps/Review'
import { Welcome } from './steps/Welcome'
import type { StepProps } from './steps/types'

const VIEWS: Record<StepId, (p: StepProps) => React.JSX.Element> = {
  welcome: Welcome,
  perspective: Perspective,
  characters: Characters,
  levels: Levels,
  parameters: Parameters,
  review: Review,
}

export default function App() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => loadState())
  useEffect(() => saveState(state), [state])

  const View = VIEWS[state.step]
  const idx = stepIndex(state.step)
  const blocked = blockReason(state)
  const isLast = idx === STEPS.length - 1

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <nav className="border-b border-zinc-800 bg-black/40 p-5 lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="mb-6">
          <div className="font-display text-sm leading-relaxed text-cart-red">MOLDFORGE</div>
          <div className="mt-1 text-xs text-zinc-500">Nintendo-mold game wizard · on REA</div>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded bg-zinc-800" aria-label="progress">
          <div className="h-full bg-cart-red transition-all" style={{ width: `${progress(state)}%` }} />
        </div>
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => {
            const locked = i > state.maxReached
            const active = s === state.step
            return (
              <li key={s}>
                <button type="button" disabled={locked} onClick={() => dispatch({ type: 'goto', step: s })}
                  className={`flex w-full items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition ${active ? 'bg-zinc-800 text-white' : locked ? 'text-zinc-600' : 'text-zinc-400 hover:bg-zinc-900'}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${active ? 'border-cart-red bg-cart-red text-white' : i < idx || i <= state.maxReached ? 'border-zinc-500' : 'border-zinc-700'}`}>{i + 1}</span>
                  {STEP_LABELS[s]}
                </button>
              </li>
            )
          })}
        </ol>
        <button type="button" className="mt-6 hidden text-xs text-zinc-600 hover:text-cart-red lg:block"
          onClick={() => { if (confirm('Clear this template and start over?')) dispatch({ type: 'reset' }) }}>
          Start over
        </button>
      </nav>

      <main className="flex flex-1 flex-col">
        <div className="flex-1 p-6 lg:p-10"><View state={state} dispatch={dispatch} /></div>
        <footer className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-zinc-800 bg-ink/95 px-6 py-4 backdrop-blur lg:px-10">
          <button type="button" className="btn-ghost" disabled={idx === 0} onClick={() => dispatch({ type: 'back' })}>← Back</button>
          <span className="text-xs text-zinc-500">{!isLast && blocked ? blocked : 'Saved locally'}</span>
          {!isLast && <button type="button" className="btn-primary" disabled={!!blocked} onClick={() => dispatch({ type: 'next' })}>Next →</button>}
          {isLast && <span />}
        </footer>
      </main>
    </div>
  )
}
