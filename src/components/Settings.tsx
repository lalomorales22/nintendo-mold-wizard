import { useEffect, useRef, useState } from 'react'
import { getConfig, mutate } from '../api/generate'
import { useStudio } from '../studio'
import type { CodeProvider } from '../model/types'
import { ModelInput } from './ModelPicker'

export function Settings() {
  const s=useStudio(), panel=useRef<HTMLElement>(null)
  const [checking,setChecking]=useState<CodeProvider|null>(null)
  const [results,setResults]=useState<Partial<Record<CodeProvider,string>>>({})
  const [catalog,setCatalog]=useState<Partial<Record<CodeProvider,string[]>>>({})
  useEffect(()=>{if(s.settingsOpen)panel.current?.scrollIntoView({block:'start',behavior:'instant'})},[s.settingsOpen])
  const check=async(provider:CodeProvider)=>{
    setChecking(provider);setResults(r=>({...r,[provider]:'Checking connection…'}))
    try {
      const config=await getConfig()
      const result=await mutate<{models:string[];identity:{organization?:string;workspace?:string}}>('models',{provider},config.csrf,s.apiKey,s.aiOptions)
      setCatalog(c=>({...c,[provider]:result.models}))
      setResults(r=>({...r,[provider]:`Connected · ${result.models.length} models listed.${result.identity.organization?' Organization: '+result.identity.organization+'.':''}${result.identity.workspace?' Workspace: '+result.identity.workspace+'.':''} This checks access, not remaining credits.`}))
    }catch(e){setResults(r=>({...r,[provider]:(e as Error).message}))}finally{setChecking(null)}
  }
  if(!s.settingsOpen)return null
  return <section ref={panel} className="settings-panel" aria-label="AI provider settings">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">POWER YOUR STUDIO</p><h2 className="text-xl font-bold">Two builders. Your keys.</h2></div><button className="btn-ghost" onClick={()=>s.setSettingsOpen(false)} aria-label="Close API settings">✕</button></div>
    <p className="mt-3 text-sm text-zinc-400">Choose OpenAI or Claude for planning and code. OpenAI creates the sprite artwork for either builder. API usage is billed separately to each account.</p>
    <div className="provider-settings-grid">{(['openai','anthropic'] as const).map(provider=>{
      const claude=provider==='anthropic',key=claude?s.anthropicKey:s.apiKey,available=claude?s.config?.anthropicKeyAvailable:s.config?.serverKeyAvailable
      return <div className="provider-panel" key={provider}><h3>{claude?'Anthropic · Claude':'OpenAI'}</h3>
        <label className="label">{claude?'Anthropic':'OpenAI'} API key<input className="input font-mono" type="password" disabled={s.busy||!!checking} value={key} onChange={e=>{(claude?s.setAnthropicKey:s.setApiKey)(e.target.value);setResults(r=>({...r,[provider]:''}))}} placeholder={available?'Private .env key available':claude?'sk-ant-…':'sk-…'} autoComplete="off" spellCheck={false}/></label>
        {claude&&<><label className="label">Workspace ID · if required<input className="input font-mono" disabled={s.busy||!!checking} value={s.workspaceId} onChange={e=>{s.setWorkspaceId(e.target.value);setResults(r=>({...r,anthropic:''}))}} placeholder="wrkspc_…" autoComplete="off" spellCheck={false}/></label><p className="rom-note">Required for multi-workspace keys. Leave blank for a key scoped to one workspace. Use a key from the organization with your API credits; an organization header is not needed.</p></>}
        <ModelInput provider={provider} value={claude?s.anthropicModel:s.openaiModel} onChange={claude?s.setAnthropicModel:s.setOpenaiModel} models={catalog[provider]} disabled={s.busy||!!checking}/>
        <div className="flex flex-wrap gap-2 mt-3"><button className="btn-ghost" disabled={!!checking||s.busy} onClick={()=>void check(provider)}>{checking===provider?'Checking…':'Check connection & load models'}</button>{key&&<button className="btn-ghost" disabled={s.busy||!!checking} onClick={()=>{(claude?s.setAnthropicKey:s.setApiKey)('');setResults(r=>({...r,[provider]:''}))}}>Forget key</button>}</div>
        <p className="rom-note" role="status">{results[provider]||(key?'Personal key entered; not checked yet':available?'Private .env key available':'Key needed')}</p>
      </div>
    })}</div>
    <p className="mt-3 text-xs text-zinc-400">Keys stay in this tab’s memory and go through this app’s PHP server only to their respective provider. They are never saved in browser storage, games or downloads. Refreshing clears entered keys. The code provider and model are saved with each new cartridge.</p>
    <button className="btn-primary mt-4" onClick={()=>s.setSettingsOpen(false)}>Done</button>
  </section>
}
