import type { ApiConfig, Cartridge, GameTemplate, GenerationJob, JobStatus } from './types'
import { templateKey } from './wizard'
import { planToTemplate, type GamePlan, type TileReference } from './plan'
import { validateTemplate } from './template'

export const PHASE_LABELS = { settings: 'Check connection', plan: 'Plan the game', save: 'Save draft', code: 'Write game code', 'test-code': 'Test code', art: 'Create transparent sprites', 'test-art': 'Test finished game', ready: 'Saved · ready to play' } as const
export type GenerationPhase = keyof typeof PHASE_LABELS
export interface GenerationStage { phase: GenerationPhase; startedAt: number; finishedAt?: number }

export const GENERATION_LABELS: Record<JobStatus, string> = {
  queued: 'Draft saved', 'analyzing-template': 'Planning the game', 'building-levels': 'Writing game code',
  'generating-assets': 'Creating artwork', packaging: 'Testing the game', done: 'Ready to play', failed: 'Needs attention',
}

export class ApiKeyRequiredError extends Error {
  constructor() {
    super('This game has not been generated yet. Add your OpenAI key in API settings or in the local .env file, then generate again.')
    this.name = 'ApiKeyRequiredError'
  }
}

interface GenerationRequest {
  template: GameTemplate
  apiKey: string
  withArt: boolean
  starter?: boolean
  resumeId?: string
  skipArt?: boolean
  repair?: string | boolean
  config?: ApiConfig
}
interface GenerationService {
  validateGame: (id: string, csrf: string) => Promise<Cartridge>
  repairGame: (id: string, csrf: string, key: string, error?: string) => Promise<Cartridge>
  getConfig: () => Promise<ApiConfig>
  getGame: (id: string) => Promise<{ game: Cartridge; template: GameTemplate }>
  createGame: (template: GameTemplate, withArt: boolean, requestId: string, csrf: string, key: string, starter?: boolean) => Promise<Cartridge>
  generateStep: (id: string, csrf: string, key: string, skipArt?: boolean) => Promise<Cartridge>
}
interface GenerationEvents {
  onConfig: (config: ApiConfig) => void
  onJob: (job: GenerationJob) => void
  onMessage: (message: string) => void
  onPhase?: (phase: GenerationPhase) => void
}

/** One click uses its own immutable plan, without replacing the editor draft. */
export async function runPromptGeneration(request: { prompt: string; reference?: TileReference; apiKey: string; withArt: boolean }, service: GenerationService & {
  planGame: (prompt: string, reference: TileReference | undefined, csrf: string, key: string) => Promise<GamePlan>
}, events: GenerationEvents): Promise<Cartridge> {
  const snapshot = structuredClone(request)
  if (snapshot.prompt.trim().length < 10 || snapshot.prompt.length > 3000) throw new Error('Describe your game in 10–3,000 characters.')
  events.onPhase?.('settings'); events.onMessage('Checking your generation settings…')
  const config = await service.getConfig(); events.onConfig(config)
  if (!snapshot.apiKey.trim() && !config.serverKeyAvailable) throw new ApiKeyRequiredError()
  events.onPhase?.('plan'); events.onMessage('Turning your idea into characters, abilities, worlds and rules…')
  const plan = await service.planGame(snapshot.prompt, snapshot.reference, config.csrf, snapshot.apiKey)
  const template = planToTemplate(plan, snapshot.reference)
  const issues = validateTemplate(template)
  if (issues.length) throw new Error(`The plan needs another attempt: ${issues.map(i => i.message).join(' ')}`)
  return runGeneration({ template, apiKey: snapshot.apiKey, withArt: snapshot.withArt, config }, service, events)
}

/** A fresh generation always creates a new cartridge. Only explicit resume reuses an ID. */
export async function runGeneration(request: GenerationRequest, service: GenerationService, events: GenerationEvents): Promise<Cartridge> {
  let current: Cartridge | undefined
  let sourceKey = templateKey(request.template)
  const log: string[] = []
  const update = (status: GenerationJob['status'], progress: number, message: string) => {
    events.onMessage(message)
    if (!current) return
    log.push(message)
    events.onJob({ id: current.id, templateKey: sourceKey, status, progress, log: [...log], createdAt: current.createdAt,
      ...(status === 'done' ? { result: { title: current.title, files: [`${current.title}.html`], note: 'Cartridge saved. Ready to play or download.' } } : {}) })
  }
  try {
    if (!request.config) { events.onPhase?.('settings'); events.onMessage('Checking your generation settings…') }
    const config = request.config ?? await service.getConfig()
    events.onConfig(config)
    if (request.resumeId) {
      const saved = await service.getGame(request.resumeId)
      current = saved.game
      sourceKey = templateKey(saved.template)
      if (request.repair) {
        if (!request.apiKey.trim() && !config.serverKeyAvailable) throw new ApiKeyRequiredError()
        events.onPhase?.('code')
        update('building-levels', 25, 'OpenAI is repairing the saved game. Its previous code will be kept…')
        current = await service.repairGame(current.id, config.csrf, request.apiKey, typeof request.repair === 'string' ? request.repair : undefined)
      }
      if (current.state === 'ready') { update('done', 100, 'Saved cartridge is ready to play.'); return current }
    }
    if (current?.state !== 'testing' && !request.starter && !request.skipArt && !request.apiKey.trim() && !config.serverKeyAvailable) throw new ApiKeyRequiredError()
    if (!current) {
      events.onPhase?.('save')
      events.onMessage('Saving a new cartridge for this template…')
      current = await service.createGame(request.template, request.withArt, crypto.randomUUID(), config.csrf, request.apiKey, request.starter)
    }
    if (current.state !== 'ready') update('queued', 10, `Draft saved for “${current.title}”.`)
    while (current.state !== 'ready') {
      if (current.state === 'testing') {
        events.onPhase?.(current.hasArt || !current.withArt ? 'test-art' : 'test-code')
        update('packaging', 85, 'Checking startup, controls, rendering, checkpoints and restart…')
        current = await service.validateGame(current.id, config.csrf)
        continue
      }
      events.onPhase?.(current.state === 'draft' ? 'code' : 'art')
      update(current.state === 'draft' ? 'building-levels' : 'generating-assets', current.state === 'draft' ? 25 : 75,
        current.state === 'draft' ? 'OpenAI is writing your game code, mechanics and levels…' : request.skipArt ? 'Packaging with drawn game artwork…' : 'Code saved. Drawing transparent characters, directions and walk frames…')
      current = await service.generateStep(current.id, config.csrf, request.apiKey, request.skipArt)
    }
    events.onPhase?.('ready')
    update('done', 100, request.starter ? 'Playable starter cartridge saved. No API usage.' : 'New game packaged and saved to your gallery.')
    return current
  } catch (error) {
    if (current) update('failed', current.state === 'code' ? 70 : 10, (error as Error).message + ' Resume this cartridge from the gallery.')
    throw error
  }
}
