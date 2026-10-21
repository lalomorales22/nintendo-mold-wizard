import { useEffect, useReducer, useRef, useState } from 'react'
import { createGame, generateStep, getConfig, getGame, getArena, mutate, selection } from './api/generate'
import { validateGame, repairGame } from './api/validate'
import { Create } from './components/Create'
import { ApiKeyRequiredError, requireKey, runGeneration, runPromptGeneration, type GenerationPhase, type GenerationStage } from './model/generation'
import type { GamePlan, TileReference } from './model/plan'
import { Brand } from './components/Brand'
import { GenerationStatus } from './components/GenerationStatus'
import { Arena } from './components/Arena'
import { runArena } from './model/arena'
import { Gallery } from './components/Gallery'
import { RomLab } from './components/RomLab'
import { Player } from './components/Player'
import { Settings } from './components/Settings'
import { loadState, saveState } from './model/storage'
import type { AiOptions, ApiConfig, ArenaMatch, Cartridge, CodeProvider, GameTemplate } from './model/types'
import { blockReason, progress, STEP_LABELS, stepIndex, STEPS, wizardReducer, type StepId } from './model/wizard'
import { Characters } from './steps/Characters'
import { Levels } from './steps/Levels'
import { Parameters } from './steps/Parameters'
import { Perspective } from './steps/Perspective'
import { Review } from './steps/Review'
import { Welcome } from './steps/Welcome'
import { StudioContext } from './studio'
import type { StepProps } from './steps/types'

const generationService = { getConfig, getGame, createGame, generateStep, validateGame, repairGame,
  planGame: (prompt: string, reference: TileReference | undefined, csrf: string, key: string, options?: AiOptions) => mutate<GamePlan>('plan', { prompt, reference, ...selection(options) }, csrf, key, options) }

const VIEWS: Record<StepId, (p: StepProps) => React.JSX.Element> = { welcome: Welcome, perspective: Perspective, characters: Characters, levels: Levels, parameters: Parameters, review: Review }

export default function App() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => loadState())
  const [page, setPage] = useState<'create' | 'studio' | 'gallery' | 'rom' | 'arena'>('studio')
  const [config, setConfig] = useState<ApiConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [provider, setProvider] = useState<CodeProvider>('openai')
  const [openaiModel, setOpenaiModel] = useState('gpt-6-sol')
  const [anthropicModel, setAnthropicModel] = useState('claude-sonnet-5-5')
  const [arenaId, setArenaId] = useState<string | null>(null)
  const [arenaProgress, setArenaProgress] = useState<Partial<Record<CodeProvider, string>>>({})
  const aiOptions: AiOptions = { provider, model: provider === 'anthropic' ? anthropicModel : openaiModel, anthropicKey, workspaceId }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [generationMessage, setGenerationMessage] = useState('')
  const [stages, setStages] = useState<GenerationStage[]>([])
  const onPhase = (phase: GenerationPhase) => setStages(previous => {
    const now = Date.now()
    return [...previous.map(s => s.finishedAt ? s : { ...s, finishedAt: now }), { phase, startedAt: now }]
  })
  const [withArt, setWithArt] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [playing, setPlaying] = useState<Cartridge | null>(null)
  const inFlight = useRef(false)
  useEffect(() => saveState(state), [state])
  useEffect(() => { getConfig().then(config => { setConfig(config); setOpenaiModel(config.codeModel); setAnthropicModel(config.anthropicModel ?? 'claude-sonnet-5-5') }).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    if (!busy) return
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [busy])
  const refresh = () => setRevision(v => v + 1)
  const remix = (template: GameTemplate) => {
    if (busy) { setError('Wait for generation to finish before changing the current template.'); return }
    if (state.template.gameTitle && !confirm('Load this game plan into the editor? This replaces your current draft; saved cartridges stay on the shelf.')) return
    dispatch({ type: 'load', state: { template, step: 'review', maxReached: 5, job: null } }); setPage('studio')
  }
  const startNewGame = () => {
    if (inFlight.current) return
    const hasDraft = !!(state.template.gameTitle || state.template.characters.length || state.template.levels.length)
    if (hasDraft && !confirm('Start a blank game? This replaces the current editor draft. Download its template first if you want to keep it. Saved gallery cartridges are kept.')) return
    dispatch({ type: 'reset' }); setPlaying(null); setError(null); setGenerationMessage(''); setWithArt(true); setPage('studio')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const generate = async (starter = false, resumeId?: string, skipArt = false, repair: string | boolean = false) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null); setPlaying(null); setStages([])
    window.scrollTo({ top: 0, behavior: 'instant' })
    // A failed new request must never leave an older Play button behind.
    if (!resumeId) dispatch({ type: 'setJob', job: null })
    try {
      const game = await runGeneration({ template: structuredClone(state.template), apiKey, withArt, starter, resumeId, skipArt, repair, options: aiOptions },
        generationService,
        { onConfig: setConfig, onMessage: setGenerationMessage, onPhase, onJob: job => dispatch({ type: 'setJob', job }) })
      refresh(); setPage('gallery'); setPlaying(game)
    } catch (e) {
      setError((e as Error).message)
      if (e instanceof ApiKeyRequiredError) setSettingsOpen(true)
      refresh()
    } finally { inFlight.current = false; setBusy(false) }
  }
  const quickGenerate = async (prompt: string, reference?: TileReference) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null); setPlaying(null); setStages([])
    window.scrollTo({ top: 0, behavior: 'instant' })
    let saved = false
    try {
      const game = await runPromptGeneration({ prompt, reference, apiKey, withArt, options: aiOptions },
        generationService,
        { onConfig: setConfig, onMessage: setGenerationMessage, onPhase, onJob: () => { saved = true } })
      refresh(); setPage('gallery'); setPlaying(game)
    } catch (e) {
      setError((e as Error).message)
      if (e instanceof ApiKeyRequiredError) setSettingsOpen(true)
      if (saved) setPage('gallery')
      refresh()
    } finally { inFlight.current = false; setBusy(false) }
  }
  const battle = async (prompt: string, resumeId?: string) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null); setPlaying(null); setStages([]); setArenaProgress({}); setPage('arena')
    try {
      const config = await getConfig(); setConfig(config)
      let match: ArenaMatch
      if (resumeId) match = await getArena(resumeId)
      else {
        requireKey('openai', config, apiKey); requireKey('anthropic', config, apiKey, aiOptions)
        match = await mutate<ArenaMatch>('arena-create', { prompt, requestId: crypto.randomUUID(), openaiModel, anthropicModel, withArt }, config.csrf, apiKey, aiOptions)
      }
      setArenaId(match.id); refresh()
      const failures = await runArena(match, apiKey, aiOptions, generationService, provider => ({
        onConfig: setConfig, onPhase,
        onJob: refresh,
        onMessage: message => { setGenerationMessage(`${provider === 'anthropic' ? 'Claude' : 'OpenAI'} · ${message}`); setArenaProgress(p => ({ ...p, [provider]: message })) },
      }))
      const messages = Object.entries(failures).map(([provider, message]) => `${provider === 'anthropic' ? 'Claude' : 'OpenAI'}: ${message}`)
      if (messages.length) setError(messages.join(' '))
    } catch (e) {
      setError((e as Error).message)
      if (e instanceof ApiKeyRequiredError) setSettingsOpen(true)
    } finally { refresh(); inFlight.current = false; setBusy(false) }
  }
  const View = VIEWS[state.step], idx = stepIndex(state.step), blocked = blockReason(state), isLast = idx === STEPS.length - 1
  return <StudioContext.Provider value={{ config, apiKey, setApiKey, anthropicKey, setAnthropicKey, workspaceId, setWorkspaceId, provider, setProvider, openaiModel, setOpenaiModel, anthropicModel, setAnthropicModel, aiOptions, battle, arenaId, arenaProgress, settingsOpen, setSettingsOpen, busy, generationMessage, withArt, setWithArt, newGame: () => setPage('create'), error, setError, revision, refresh, generate, quickGenerate, play: setPlaying, remix, showGallery: () => setPage('gallery') }}>
    <div className="studio-shell">
      <aside className="studio-sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setPage('studio') }}><Brand /></a>
        <div className="sidebar-switch"><button className={page === 'create' || page === 'studio' ? 'active' : ''} disabled={busy} onClick={() => { setPage('create'); setError(null) }}>✦ Create</button><button className={page === 'gallery' ? 'active' : ''} onClick={() => setPage('gallery')}>▦ Gallery</button></div>
        <button className="new-game-button" disabled={busy} onClick={() => { setPage('create'); setError(null) }}>＋ New game</button>
        <button className={`rom-nav-button ${page === 'rom' ? 'active' : ''}`} disabled={busy} onClick={() => { setPage('rom'); setError(null) }}>▤ ROM Lab <span>NES / SNES</span></button>
        <button className={`rom-nav-button ${page === 'arena' ? 'active' : ''}`} onClick={() => setPage('arena')}>⚔ Battle Arena <span>AI vs AI</span></button>
        <p className="sidebar-caption">BUILD YOUR NEXT GAME</p>
        <ol className="wizard-nav">{STEPS.map((s, i) => <li key={s}><button disabled={i > state.maxReached || busy} className={page === 'studio' && s === state.step ? 'active' : ''} onClick={() => { dispatch({ type: 'goto', step: s }); setPage('studio') }}><span className="step-number">{i < idx ? '✓' : `0${i + 1}`}</span>{STEP_LABELS[s]}{page === 'studio' && s === state.step && <span className="step-dot" />}</button></li>)}</ol>
        <div className="sidebar-bottom"><div className="studio-note"><span>✧</span><p>Made for the games<br />you wish existed.</p></div><button className="key-button" onClick={() => setSettingsOpen(!settingsOpen)}><span className={`connection-dot ${(provider === 'anthropic' ? anthropicKey || config?.anthropicKeyAvailable : apiKey || config?.serverKeyAvailable) ? 'connected' : ''}`} />{provider === 'anthropic' ? 'Claude' : 'OpenAI'} · API settings<span>↗</span></button><p className="sidebar-fine">Original games. Old-school soul.<br />Built by Lalo Adrian Morales.</p></div>
      </aside>
      <div className="studio-main"><header className="top-bar"><div><span className="status-light" /> Game-Maker / CREATOR SYSTEM</div><span>{busy ? '✦ Building your cartridge…' : '● POWER ON'}</span></header>
        <main className="workspace"><Settings />{error && <div className="error-banner" role="alert"><p>{error}</p><button onClick={() => setError(null)} aria-label="Dismiss error">✕</button></div>}
          {busy && <GenerationStatus message={generationMessage} stages={stages} />}
          <div hidden={page !== 'rom'}><RomLab /></div>
          <div hidden={page !== 'create'}><Create state={state} startNew={startNewGame} continueDraft={() => setPage('studio')} openRoms={() => setPage('rom')} /></div>
          {page === 'rom' || page === 'create' ? null : page === 'gallery' ? <Gallery /> : page === 'arena' ? <Arena /> : <fieldset disabled={busy} className="min-w-0"><View state={state} dispatch={dispatch} /></fieldset>}
        </main>
        {page === 'studio' && !busy && <footer className="wizard-footer"><button className="btn-ghost" disabled={idx === 0 || busy} onClick={() => dispatch({ type: 'back' })}>← Back</button><div className="footer-progress"><span>{blocked && !isLast ? blocked : '✓ Draft saved in this browser'}</span><div><i style={{ width: `${progress(state)}%` }} /></div></div>{!isLast ? <button className="btn-primary" disabled={!!blocked || busy} onClick={() => dispatch({ type: 'next' })}>Continue →</button> : <span className="text-xs text-zinc-500">06 / 06</span>}</footer>}
      </div>
    </div>
    {playing && <Player key={playing.id} game={playing} close={() => setPlaying(null)} />}
  </StudioContext.Provider>
}
