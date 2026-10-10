import { useEffect, useReducer, useRef, useState } from 'react'
import { createGame, generateStep, getConfig, getGame } from './api/generate'
import { Gallery } from './components/Gallery'
import { Player } from './components/Player'
import { Settings } from './components/Settings'
import { loadState, saveState } from './model/storage'
import type { ApiConfig, Cartridge, GameTemplate, GenerationJob } from './model/types'
import { blockReason, progress, STEP_LABELS, stepIndex, STEPS, wizardReducer, type StepId } from './model/wizard'
import { Characters } from './steps/Characters'
import { Levels } from './steps/Levels'
import { Parameters } from './steps/Parameters'
import { Perspective } from './steps/Perspective'
import { Review } from './steps/Review'
import { Welcome } from './steps/Welcome'
import { StudioContext } from './studio'
import type { StepProps } from './steps/types'

const VIEWS: Record<StepId, (p: StepProps) => React.JSX.Element> = { welcome: Welcome, perspective: Perspective, characters: Characters, levels: Levels, parameters: Parameters, review: Review }

export default function App() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => loadState())
  const [page, setPage] = useState<'studio' | 'gallery'>('studio')
  const [config, setConfig] = useState<ApiConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [playing, setPlaying] = useState<Cartridge | null>(null)
  const inFlight = useRef(false)
  useEffect(() => saveState(state), [state])
  useEffect(() => { getConfig().then(setConfig).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    if (!busy) return
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [busy])
  const refresh = () => setRevision(v => v + 1)
  const remix = (template: GameTemplate) => {
    if (busy) { setError('Wait for generation to finish before changing the current template.'); return }
    if (state.template.gameTitle && !confirm('Load this cartridge’s template into the editor? This replaces your current draft; saved cartridges stay on the shelf.')) return
    dispatch({ type: 'load', state: { template, step: 'review', maxReached: 5, job: null } }); setPage('studio')
  }
  const generate = async (starter = false, resumeId?: string, skipArt = false) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    let current: Cartridge | undefined
    const log: string[] = []
    const updateJob = (status: GenerationJob['status'], progressValue: number, note: string) => {
      if (!current) return
      log.push(note)
      dispatch({ type: 'setJob', job: { id: current.id, status, progress: progressValue, log: [...log], createdAt: current.createdAt,
        ...(status === 'done' ? { result: { title: current.title, files: [`${current.title}.html`], note: 'Cartridge saved. Ready to play or download.' } } : {}) } })
    }
    try {
      const liveConfig = await getConfig(); setConfig(liveConfig)
      if (!starter && !skipArt && !apiKey.trim() && !liveConfig.serverKeyAvailable) { setSettingsOpen(true); throw new Error('Add your OpenAI key to generate code and artwork.') }
      const withArt = document.querySelector<HTMLInputElement>('#with-art')?.checked ?? true
      current = resumeId ? (await getGame(resumeId)).game : await createGame(state.template, withArt, crypto.randomUUID(), liveConfig.csrf, apiKey, starter)
      if (current.state !== 'ready') updateJob('queued', 10, 'Draft saved to your private gallery.')
      while (current.state !== 'ready') {
        updateJob(current.state === 'draft' ? 'building-levels' : 'generating-assets', current.state === 'draft' ? 25 : 75,
          current.state === 'draft' ? 'OpenAI is writing your game code, mechanics and levels…' : skipArt ? 'Packaging with drawn game artwork…' : 'Code saved. OpenAI is drawing your sprite atlas…')
        current = await generateStep(current.id, liveConfig.csrf, apiKey, skipArt)
      }
      updateJob('done', 100, starter ? 'Playable starter cartridge saved. No API usage.' : 'Game and artwork packaged into a standalone HTML cartridge.')
      refresh(); setPage('gallery'); setPlaying(current)
    } catch (e) {
      const message = (e as Error).message
      setError(message)
      if (current) { updateJob('failed', current.state === 'code' ? 70 : 10, message + ' Resume this cartridge from the gallery.'); refresh() }
    } finally { inFlight.current = false; setBusy(false) }
  }
  const View = VIEWS[state.step], idx = stepIndex(state.step), blocked = blockReason(state), isLast = idx === STEPS.length - 1
  return <StudioContext.Provider value={{ config, apiKey, setApiKey, settingsOpen, setSettingsOpen, busy, error, setError, revision, refresh, generate, play: setPlaying, remix, showGallery: () => setPage('gallery') }}>
    <div className="studio-shell">
      <aside className="studio-sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setPage('studio') }}><span className="brand-icon">M<span>✦</span></span><span>MOLDFORGE<small>THE LITTLE GAME STUDIO</small></span></a>
        <div className="sidebar-switch"><button className={page === 'studio' ? 'active' : ''} onClick={() => setPage('studio')}>✦ Create</button><button className={page === 'gallery' ? 'active' : ''} onClick={() => setPage('gallery')}>▦ Gallery</button></div>
        <p className="sidebar-caption">YOUR NEXT GREAT GAME</p>
        <ol className="wizard-nav">{STEPS.map((s, i) => <li key={s}><button disabled={i > state.maxReached || busy} className={page === 'studio' && s === state.step ? 'active' : ''} onClick={() => { dispatch({ type: 'goto', step: s }); setPage('studio') }}><span className="step-number">{i < idx ? '✓' : `0${i + 1}`}</span>{STEP_LABELS[s]}{page === 'studio' && s === state.step && <span className="step-dot" />}</button></li>)}</ol>
        <div className="sidebar-bottom"><div className="studio-note"><span>✧</span><p>Made for the games<br />you wish existed.</p></div><button className="key-button" onClick={() => setSettingsOpen(!settingsOpen)}><span className={`connection-dot ${apiKey || config?.serverKeyAvailable ? 'connected' : ''}`} />{apiKey || config?.serverKeyAvailable ? 'OpenAI key ready' : 'Connect OpenAI'}<span>↗</span></button><button className="reset-button" disabled={busy} onClick={() => { if (confirm('Clear the current template? Saved cartridges stay in your gallery.')) { dispatch({ type: 'reset' }); setPage('studio') } }}>New blank project</button><p className="sidebar-fine">Original games. Old-school soul.<br />Built by Lalo Adrian Morales.</p></div>
      </aside>
      <div className="studio-main"><header className="top-bar"><div><span className="status-light" /> INDEPENDENT GAME MAKING CLUB</div><span>{busy ? '✦ Forging your cartridge…' : '● ALL IDEAS WELCOME'}</span></header>
        <main className="workspace"><Settings />{error && <div className="error-banner" role="alert"><p>{error}</p><button onClick={() => setError(null)} aria-label="Dismiss error">✕</button></div>}
          {page === 'gallery' ? <Gallery /> : <fieldset disabled={busy} className="min-w-0"><View state={state} dispatch={dispatch} /></fieldset>}
        </main>
        {page === 'studio' && <footer className="wizard-footer"><button className="btn-ghost" disabled={idx === 0 || busy} onClick={() => dispatch({ type: 'back' })}>← Back</button><div className="footer-progress"><span>{blocked && !isLast ? blocked : '✓ Draft saved in this browser'}</span><div><i style={{ width: `${progress(state)}%` }} /></div></div>{!isLast ? <button className="btn-primary" disabled={!!blocked || busy} onClick={() => dispatch({ type: 'next' })}>Continue →</button> : <span className="text-xs text-zinc-500">06 / 06</span>}</footer>}
      </div>
    </div>
    {playing && <Player key={playing.id} game={playing} close={() => setPlaying(null)} />}
  </StudioContext.Provider>
}
