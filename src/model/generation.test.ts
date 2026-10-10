import { describe, expect, it, vi } from 'vitest'
import { ApiKeyRequiredError, runGeneration } from './generation'
import { exampleTemplate } from './template'
import type { ApiConfig, Cartridge, GameTemplate, GenerationJob } from './types'
import { templateKey } from './wizard'

function setup(hasKey = true) {
  let nextId = 0
  const cartridges = new Map<string, { game: Cartridge; template: GameTemplate }>()
  const config: ApiConfig = { csrf: 'test-token', serverKeyAvailable: hasKey, codeModel: 'fixture', imageModel: 'fixture' }
  const service = {
    getConfig: vi.fn(async () => config),
    getGame: vi.fn(async (id: string) => structuredClone(cartridges.get(id)!)),
    createGame: vi.fn(async (template: GameTemplate, withArt: boolean, _requestId: string, _csrf: string, _key: string, starter = false): Promise<Cartridge> => {
      const game: Cartridge = { id: `cartridge-${++nextId}`, title: template.gameTitle, pitch: template.pitch, perspective: template.perspective!,
        state: starter ? 'ready' : 'draft', withArt, owned: true, hasArt: false, published: false, createdAt: '2026-10-10T00:00:00Z', provider: starter ? 'starter' : 'openai',
        summary: '', instructions: '', error: null, artStyle: template.parameters.artStyle, levelCount: template.levels.length }
      cartridges.set(game.id, { game: structuredClone(game), template: structuredClone(template) })
      return game
    }),
    generateStep: vi.fn(async (id: string, _csrf: string, _key: string, skipArt = false): Promise<Cartridge> => {
      const saved = cartridges.get(id)!
      saved.game.state = saved.game.state === 'draft' && saved.game.withArt ? 'code' : 'ready'
      saved.game.hasArt = saved.game.state === 'ready' && saved.game.withArt && !skipArt
      return structuredClone(saved.game)
    }),
  }
  const jobs: GenerationJob[] = []
  const events = { onJob: (job: GenerationJob) => jobs.push(job), onConfig: vi.fn(), onMessage: vi.fn() }
  return { service, events, jobs, cartridges }
}

describe('generation and regeneration', () => {
  it('generates a distinct cartridge on each new attempt and binds Play to the new template', async () => {
    const { service, events, jobs } = setup()
    const template = exampleTemplate()
    const first = await runGeneration({ template, withArt: true, apiKey: '' }, service, events)
    const nextTemplate = { ...template, gameTitle: 'Penguin Punch' }
    const next = await runGeneration({ template: nextTemplate, withArt: false, apiKey: '' }, service, events)
    expect(first.id).not.toBe(next.id)
    expect(first.title).toBe('Charge Quest')
    expect(next.title).toBe('Penguin Punch')
    expect(service.createGame.mock.calls[0][2]).not.toBe(service.createGame.mock.calls[1][2])
    expect(jobs.at(-1)?.id).toBe(next.id)
    expect(jobs.at(-1)?.result?.title).toBe('Penguin Punch')
    expect(jobs.at(-1)?.templateKey).toBe(templateKey(nextTemplate))
    expect(service.createGame.mock.calls[1][1]).toBe(false)
  })
  it('reports a missing API key before creating a cartridge and never reports old success', async () => {
    const { service, events, jobs } = setup(false)
    await expect(runGeneration({ template: exampleTemplate(), withArt: true, apiKey: '' }, service, events)).rejects.toBeInstanceOf(ApiKeyRequiredError)
    expect(service.createGame).not.toHaveBeenCalled()
    expect(service.generateStep).not.toHaveBeenCalled()
    expect(jobs).toEqual([])
    expect(events.onMessage).toHaveBeenCalledWith('Checking your generation settings…')
  })
  it('preserves the failed cartridge identity and resumes it instead of allocating a replacement', async () => {
    const { service, events, jobs, cartridges } = setup()
    service.generateStep.mockRejectedValueOnce(new Error('OpenAI quota exhausted'))
    const template = exampleTemplate()
    await expect(runGeneration({ template, withArt: true, apiKey: '' }, service, events)).rejects.toThrow('quota')
    const failed = jobs.at(-1)!
    expect(failed.status).toBe('failed')
    expect(failed.result).toBeUndefined()
    const resumed = await runGeneration({ template: { ...template, gameTitle: 'Unrelated editor draft' }, withArt: true, apiKey: '', resumeId: failed.id }, service, events)
    expect(resumed.id).toBe(failed.id)
    expect(service.createGame).toHaveBeenCalledTimes(1)
    expect(jobs.at(-1)?.templateKey).toBe(templateKey(cartridges.get(failed.id)!.template))
  })
  it('supports key-free starters and opening an already complete cartridge', async () => {
    const { service, events } = setup(false)
    const template = exampleTemplate()
    const starter = await runGeneration({ template, withArt: false, apiKey: '', starter: true }, service, events)
    expect(starter.state).toBe('ready')
    expect(service.generateStep).not.toHaveBeenCalled()
    expect((await runGeneration({ template, withArt: false, apiKey: '', resumeId: starter.id }, service, events)).id).toBe(starter.id)
    expect(service.createGame).toHaveBeenCalledTimes(1)
  })
  it('does not turn a server failure into a success or a stale Play result', async () => {
    const { service, events, jobs } = setup()
    service.getConfig.mockRejectedValueOnce(new Error('PHP server unavailable'))
    await expect(runGeneration({ template: exampleTemplate(), withArt: false, apiKey: '' }, service, events)).rejects.toThrow('PHP server unavailable')
    expect(jobs).toEqual([])
    expect(service.createGame).not.toHaveBeenCalled()
  })
})
