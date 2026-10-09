import { useState, type ReactNode } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

/** Editable list of short strings. Enter or comma adds a tag. */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))])
    setDraft('')
  }
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900 p-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="chip flex items-center gap-1 bg-zinc-800">
            {v}
            <button type="button" aria-label={`Remove ${v}`} className="text-zinc-500 hover:text-cart-red" onClick={() => onChange(value.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-zinc-500"
          value={draft}
          placeholder={placeholder ?? 'Type and press Enter'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={add}
        />
      </div>
    </div>
  )
}

export function Slider({ label, value, onChange, left, right }: { label: string; value: number; onChange: (n: number) => void; left?: string; right?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-xs text-zinc-300">{value}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#e60012]" />
      {(left || right) && (
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500"><span>{left}</span><span>{right}</span></div>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition ${o === value ? 'border-cart-red bg-cart-red/15 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
          {o}
        </button>
      ))}
    </div>
  )
}

export function StepHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cart-red">{kicker}</p>
      <h1 className="mt-1 text-2xl font-bold text-white">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-sm text-zinc-400">{children}</p>}
    </header>
  )
}
