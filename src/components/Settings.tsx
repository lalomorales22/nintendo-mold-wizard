import { useEffect, useRef } from 'react'
import { useStudio } from '../studio'

export function Settings() {
  const { config, apiKey, setApiKey, settingsOpen, setSettingsOpen } = useStudio()
  const panel = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (settingsOpen) { panel.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); input.current?.focus({ preventScroll: true }) }
  }, [settingsOpen])
  if (!settingsOpen) return null
  return <section ref={panel} className="settings-panel" aria-label="OpenAI API settings">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">POWER YOUR STUDIO</p><h2 className="text-xl font-bold">Your key. Your creations.</h2></div><button className="btn-ghost" onClick={() => setSettingsOpen(false)} aria-label="Close API settings">✕</button></div>
    <p className="mt-3 text-sm text-zinc-400">Use your OpenAI API key to create game code and original artwork. Generation is billed to that API account.</p>
    <label className="label mt-5" htmlFor="api-key">OpenAI API key</label>
    <input ref={input} id="api-key" className="input font-mono" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={config?.serverKeyAvailable ? 'Local .env key is available, or enter your own' : 'sk-…'} autoComplete="off" spellCheck={false} />
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">Kept in this tab’s memory only and sent to this app’s PHP server for OpenAI requests. Never saved in your gallery or browser storage. Refreshing clears it.</p>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button className="btn-primary" onClick={() => setSettingsOpen(false)}>Done</button>{apiKey && <button className="btn-ghost" onClick={() => setApiKey('')}>Forget key</button>}<span className="text-xs text-emerald-300">{apiKey ? 'Personal key entered' : config?.serverKeyAvailable ? 'Local .env key available' : 'Key needed for AI generation'}</span></div>
    {config && <p className="mt-4 text-xs text-zinc-500">Code: {config.codeModel} · Artwork: {config.imageModel}</p>}
  </section>
}
