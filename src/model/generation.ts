import type { ApiConfig, Cartridge, GameTemplate, GenerationJob, JobStatus } from './types'
import { templateKey } from './wizard'

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
    events.onMessage('Checking your generation settings…')
    const config = await service.getConfig()
    events.onConfig(config)
    if (request.resumeId) {
      const saved = await service.getGame(request.resumeId)
      current = saved.game
      sourceKey = templateKey(saved.template)
      if (request.repair) {
        if (!request.apiKey.trim() && !config.serverKeyAvailable) throw new ApiKeyRequiredError()
        update('building-levels', 25, 'OpenAI is repairing the saved game. Its previous code will be kept…')
        current = await service.repairGame(current.id, config.csrf, request.apiKey, typeof request.repair === 'string' ? request.repair : undefined)
      }
      if (current.state === 'ready') { update('done', 100, 'Saved cartridge is ready to play.'); return current }
    }
    if (current?.state !== 'testing' && !request.starter && !request.skipArt && !request.apiKey.trim() && !config.serverKeyAvailable) throw new ApiKeyRequiredError()
    if (!current) {
      events.onMessage('Saving a new cartridge for this template…')
      current = await service.createGame(request.template, request.withArt, crypto.randomUUID(), config.csrf, request.apiKey, request.starter)
    }
    if (current.state !== 'ready') update('queued', 10, `Draft saved for “${current.title}”.`)
    while (current.state !== 'ready') {
      if (current.state === 'testing') {
        update('packaging', 85, 'Checking startup, controls, rendering, checkpoints and restart…')
        current = await service.validateGame(current.id, config.csrf)
        continue
      }
      update(current.state === 'draft' ? 'building-levels' : 'generating-assets', current.state === 'draft' ? 25 : 75,
        current.state === 'draft' ? 'OpenAI is writing your game code, mechanics and levels…' : request.skipArt ? 'Packaging with drawn game artwork…' : 'Code saved. OpenAI is drawing your sprite atlas…')
      current = await service.generateStep(current.id, config.csrf, request.apiKey, request.skipArt)
    }
    update('done', 100, request.starter ? 'Playable starter cartridge saved. No API usage.' : 'New game packaged and saved to your gallery.')
    return current
  } catch (error) {
    if (current) update('failed', current.state === 'code' ? 70 : 10, (error as Error).message + ' Resume this cartridge from the gallery.')
    throw error
  }
}
