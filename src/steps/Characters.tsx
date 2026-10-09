import { useState } from 'react'
import { Field, Segmented, Slider, StepHeader } from '../components/ui'
import { getMold } from '../model/molds'
import { newCharacter, uid } from '../model/template'
import { ROLES, type AssetRef, type CharacterSheet } from '../model/types'
import type { StepProps } from './types'

const ROLE_COLOR: Record<string, string> = { hero: 'text-emerald-400', npc: 'text-sky-400', enemy: 'text-amber-400', boss: 'text-cart-red' }
const ASSET_KINDS: AssetRef['kind'][] = ['sprite', 'model', 'portrait', 'reference']

export function Characters({ state, dispatch }: StepProps) {
  const { characters, perspective } = state.template
  const [selId, setSelId] = useState<string | null>(characters[0]?.id ?? null)
  const sel = characters.find((c) => c.id === selId) ?? null
  const mold = getMold(perspective)

  const add = (role: CharacterSheet['role']) => {
    const c = newCharacter(perspective, role)
    dispatch({ type: 'upsertCharacter', character: c })
    setSelId(c.id)
  }
  const update = (patch: Partial<CharacterSheet>) => sel && dispatch({ type: 'upsertCharacter', character: { ...sel, ...patch } })

  return (
    <div>
      <StepHeader kicker="Step 3 · Character sheet" title="Build your cast">
        Heroes, NPCs, enemies and bosses. Stats come from the {mold?.name ?? 'selected'} mold. Sprites are placeholders: write a prompt or a file path for now.
      </StepHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2">
          {characters.length === 0 && <p className="text-sm text-zinc-500">No characters yet. Start with a hero.</p>}
          {characters.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelId(c.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${c.id === selId ? 'border-cart-red bg-zinc-900' : 'border-zinc-800 hover:border-zinc-600'}`}>
              <span className="truncate">{c.name || <em className="text-zinc-500">Unnamed</em>}</span>
              <span className={`text-xs uppercase ${ROLE_COLOR[c.role]}`}>{c.role}</span>
            </button>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            {ROLES.map((r) => (
              <button key={r} type="button" className="btn-ghost justify-center capitalize" onClick={() => add(r)}>+ {r}</button>
            ))}
          </div>
        </aside>

        {sel ? (
          <section className="card grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name"><input className="input" value={sel.name} onChange={(e) => update({ name: e.target.value })} placeholder="Character name" /></Field>
              <div><span className="label">Role</span><Segmented options={ROLES} value={sel.role} onChange={(role) => update({ role })} /></div>
            </div>
            <Field label="Description"><textarea className="input min-h-16" value={sel.description} onChange={(e) => update({ description: e.target.value })} placeholder="Look, personality, motivation" /></Field>

            <div>
              <span className="label">Stats</span>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(sel.stats).map(([k, v]) => (
                  <Slider key={k} label={k} value={v} onChange={(n) => update({ stats: { ...sel.stats, [k]: n } })} />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label">Abilities</span>
                <button type="button" className="text-xs text-cart-red hover:underline"
                  onClick={() => update({ abilities: [...sel.abilities, { id: uid('abl'), name: '', description: '', input: '' }] })}>+ Add ability</button>
              </div>
              {sel.abilities.length === 0 && <p className="text-xs text-zinc-500">Suggested verbs for this mold: {mold?.coreVerbs.join(', ')}</p>}
              <div className="space-y-2">
                {sel.abilities.map((a, i) => (
                  <div key={a.id} className="grid grid-cols-[1fr_2fr_80px_auto] gap-2">
                    {(['name', 'description', 'input'] as const).map((f) => (
                      <input key={f} className="input" placeholder={f} value={a[f] ?? ''}
                        onChange={(e) => { const ab = sel.abilities.slice(); ab[i] = { ...a, [f]: e.target.value }; update({ abilities: ab }) }} />
                    ))}
                    <button type="button" aria-label="Remove ability" className="px-2 text-zinc-500 hover:text-cart-red" onClick={() => update({ abilities: sel.abilities.filter((x) => x.id !== a.id) })}>×</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label">Sprites / refs (placeholders)</span>
                <button type="button" className="text-xs text-cart-red hover:underline" onClick={() => update({ assets: [...sel.assets, { kind: 'reference', value: '' }] })}>+ Add ref</button>
              </div>
              <div className="space-y-2">
                {sel.assets.map((a, i) => (
                  <div key={i} className="grid grid-cols-[130px_1fr_auto] gap-2">
                    <select className="input" value={a.kind} onChange={(e) => { const as = sel.assets.slice(); as[i] = { ...a, kind: e.target.value as AssetRef['kind'] }; update({ assets: as }) }}>
                      {ASSET_KINDS.map((k) => <option key={k}>{k}</option>)}
                    </select>
                    <input className="input" placeholder="Prompt, file path, or URL" value={a.value}
                      onChange={(e) => { const as = sel.assets.slice(); as[i] = { ...a, value: e.target.value }; update({ assets: as }) }} />
                    <button type="button" aria-label="Remove ref" className="px-2 text-zinc-500 hover:text-cart-red" onClick={() => update({ assets: sel.assets.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="text-xs text-zinc-500 hover:text-cart-red" onClick={() => { dispatch({ type: 'removeCharacter', id: sel.id }); setSelId(null) }}>Delete character</button>
            </div>
          </section>
        ) : (
          <section className="card grid place-items-center text-sm text-zinc-500">Select or add a character.</section>
        )}
      </div>
    </div>
  )
}
