import { useId } from 'react'
import { useStudio } from '../studio'
import type { CodeProvider } from '../model/types'

const modelPresets = { openai: ['gpt-6-sol'], anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] }
export function ModelInput({ provider, value, onChange, models = [], disabled = false }: {provider: CodeProvider; value: string; onChange: (value: string) => void; models?: string[]; disabled?: boolean}) {
  const id=useId()
  return <label className="label">{provider==='anthropic'?'Claude':'OpenAI'} code model
    <input className="input font-mono" list={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} spellCheck={false} autoComplete="off" maxLength={100} />
    <datalist id={id}>{[...new Set([value,...models,...modelPresets[provider]])].filter(Boolean).map(model=><option key={model} value={model}/>)}</datalist>
  </label>
}
export function ModelPicker() {
  const s=useStudio()
  return <div className="model-picker"><label className="label">Planning &amp; code provider<select className="input" value={s.provider} disabled={s.busy} onChange={e=>s.setProvider(e.target.value as CodeProvider)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic · Claude</option></select></label>
    <ModelInput provider={s.provider} value={s.provider==='anthropic'?s.anthropicModel:s.openaiModel} onChange={s.provider==='anthropic'?s.setAnthropicModel:s.setOpenaiModel} disabled={s.busy}/>
    <p className="rom-note">Artwork: OpenAI · {s.config?.imageModel??'gpt-image-1.5'}. <button className="text-emerald-300" onClick={()=>s.setSettingsOpen(true)}>Connect providers →</button></p>
  </div>
}
