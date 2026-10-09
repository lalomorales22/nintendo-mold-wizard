import { useState } from 'react'
import { Field, StepHeader, TagInput } from '../components/ui'
import { getMold } from '../model/molds'
import { newLevel } from '../model/template'
import type { LevelSheet } from '../model/types'
import type { StepProps } from './types'

export function Levels({ state, dispatch }: StepProps) {
  const { levels, characters, perspective } = state.template
  const [selId, setSelId] = useState<string | null>(levels[0]?.id ?? null)
  const sel = levels.find((l) => l.id === selId) ?? null
  const foes = characters.filter((c) => c.role === 'enemy' || c.role === 'boss')
  const mold = getMold(perspective)

  const add = () => { const l = newLevel(); dispatch({ type: 'upsertLevel', level: l }); setSelId(l.id) }
  const update = (patch: Partial<LevelSheet>) => sel && dispatch({ type: 'upsertLevel', level: { ...sel, ...patch } })
  const move = (dir: -1 | 1) => sel && dispatch({ type: 'moveLevel', id: sel.id, dir })

  return (
    <div>
      <StepHeader kicker="Step 4 · Level sheet" title="Lay out the levels">
        This mold expects <b className="text-zinc-200">{mold?.levelShape ?? 'levels'}</b>. Describe each one in plain words; the generator turns layout notes into geometry.
      </StepHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          {levels.map((l, i) => (
            <button key={l.id} type="button" onClick={() => setSelId(l.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${l.id === selId ? 'border-cart-red bg-zinc-900' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <span className="font-mono text-xs text-cart-red">{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate">{l.name || <em className="text-zinc-500">Unnamed</em>}</span>
            </button>
          ))}
          <button type="button" className="btn-ghost w-full justify-center" onClick={add}>+ Add level</button>
        </aside>

        {sel ? (
          <section className="card grid gap-4">
            <div className="flex gap-2">
              <Field label="Level name"><input className="input" value={sel.name} placeholder="e.g. 1-1 Border Crossing" onChange={(e) => update({ name: e.target.value })} /></Field>
              <div className="flex items-end gap-1">
                <button type="button" className="btn-ghost px-2" aria-label="Move up" onClick={() => move(-1)}>↑</button>
                <button type="button" className="btn-ghost px-2" aria-label="Move down" onClick={() => move(1)}>↓</button>
              </div>
            </div>
            <Field label="Layout notes" hint="Rooms, paths, hazards, secrets, pacing.">
              <textarea className="input min-h-28" value={sel.layoutNotes} onChange={(e) => update({ layoutNotes: e.target.value })}
                placeholder="Start at the pier. Three lanes of traffic. Hidden charger behind the taco stand. Boss at the checkpoint." />
            </Field>
            <div>
              <span className="label">Enemies</span>
              {foes.length === 0 ? <p className="text-xs text-zinc-500">Add enemy or boss characters in the previous step to place them here.</p> : (
                <div className="flex flex-wrap gap-2">
                  {foes.map((f) => {
                    const on = sel.enemyIds.includes(f.id)
                    return (
                      <button key={f.id} type="button" onClick={() => update({ enemyIds: on ? sel.enemyIds.filter((x) => x !== f.id) : [...sel.enemyIds, f.id] })}
                        className={`chip ${on ? 'border-cart-red bg-cart-red/15 text-white' : ''}`}>{f.name || 'Unnamed'} · {f.role}</button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Collectibles"><TagInput value={sel.collectibles} onChange={(collectibles) => update({ collectibles })} placeholder="coins, keys..." /></Field>
              <Field label="Exits"><TagInput value={sel.exits} onChange={(exits) => update({ exits })} placeholder="goal flag, warp..." /></Field>
              <Field label="Music / mood"><TagInput value={sel.musicMoodTags} onChange={(musicMoodTags) => update({ musicMoodTags })} placeholder="tense, night..." /></Field>
            </div>
            <div className="flex justify-end">
              <button type="button" className="text-xs text-zinc-500 hover:text-cart-red" onClick={() => { dispatch({ type: 'removeLevel', id: sel.id }); setSelId(null) }}>Delete level</button>
            </div>
          </section>
        ) : (
          <section className="card grid place-items-center text-sm text-zinc-500">Select or add a level.</section>
        )}
      </div>
    </div>
  )
}
