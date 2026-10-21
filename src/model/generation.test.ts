import { describe, expect, it, vi } from 'vitest'
import { ApiKeyRequiredError, runGeneration, runPromptGeneration, type GenerationPhase } from './generation'
import type { GamePlan } from './plan'
import { exampleTemplate } from './template'
import type { ApiConfig, Cartridge, GameTemplate, GenerationJob } from './types'
import { templateKey } from './wizard'

function setup(hasKey = true) {
  let nextId = 0
  const cartridges = new Map<string, { game: Cartridge; template: GameTemplate }>()
  const config: ApiConfig = { csrf: 'test-token', serverKeyAvailable: hasKey, codeModel: 'fixture', imageModel: 'fixture' }
  const service = {
    validateGame: vi.fn(async (id: string): Promise<Cartridge> => {
      const saved = cartridges.get(id)!
      saved.game.state = saved.game.withArt && !saved.game.hasArt ? 'code' : 'ready'
      return structuredClone(saved.game)
    }),
    repairGame: vi.fn(async (id: string): Promise<Cartridge> => {
      const saved = cartridges.get(id)!
      saved.game.state = 'testing'
      return structuredClone(saved.game)
    }),
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
      saved.game.hasArt = saved.game.state === 'code' && !skipArt
      if (skipArt) saved.game.withArt = false
      saved.game.state = 'testing'
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

describe('runtime acceptance gate', () => {
  it('holds failed games for testing and never buys art or silently repairs them', async () => {
    const { service, events, jobs } = setup()
    service.validateGame.mockRejectedValueOnce(new Error('Missing render'))
    await expect(runGeneration({ template: exampleTemplate(), withArt: true, apiKey: '' }, service, events)).rejects.toThrow('Missing render')
    expect(service.generateStep).toHaveBeenCalledTimes(1)
    expect(service.repairGame).not.toHaveBeenCalled()
    expect(jobs.at(-1)?.status).toBe('failed')
    expect(jobs.at(-1)?.result).toBeUndefined()
  })
  it('checks code before art and checks again with art', async () => {
    const { service, events } = setup()
    await runGeneration({ template: exampleTemplate(), withArt: true, apiKey: '' }, service, events)
    expect(service.validateGame).toHaveBeenCalledTimes(2)
    expect(service.validateGame.mock.invocationCallOrder[0]).toBeLessThan(service.generateStep.mock.invocationCallOrder[1])
  })
  it('repairs only after explicit request, then tests the same cartridge', async () => {
    const { service, events } = setup()
    const game = await runGeneration({ template: exampleTemplate(), withArt: false, apiKey: '' }, service, events)
    const repaired = await runGeneration({ template: exampleTemplate(), withArt: false, apiKey: '', resumeId: game.id, repair: 'Missing helper' }, service, events)
    expect(repaired.id).toBe(game.id)
    expect(service.repairGame).toHaveBeenCalledWith(game.id, 'test-token', '', 'Missing helper')
    expect(service.validateGame).toHaveBeenCalledTimes(2)
    expect(service.createGame).toHaveBeenCalledTimes(1)
  })
})

const quickPlan: GamePlan = {
  title: 'Moon Mail', pitch: 'A penguin delivers moon letters.', perspective: 'top-down', coreLoop: 'Dodge rivals and deliver letters.', visualStyle: 'Blue and gold pixels', observations: 'Based on description.', assumptions: 'One short stage.',
  hero: {name:'Pip',description:'Penguin courier',ability:'Dash',abilityDescription:'Dash with Z'}, enemy:{name:'Crab',description:'Moon crab'},
  levels:[{name:'Moon port',layout:'Open paths around rocks',goal:'Reach the mailbox'}],win:'Deliver the mail',lose:'Lose all lives',
}
describe('paragraph to playable cartridge', () => {
  it('plans once, uses that template, saves and tests before returning the playable game', async () => {
    const {service,events,jobs,cartridges}=setup()
    const phases: GenerationPhase[]=[]
    const planGame=vi.fn(async()=>quickPlan)
    const request={prompt:'A penguin courier delivers letters on the moon.',apiKey:'',withArt:true}
    const result=await runPromptGeneration(request,{...service,planGame},{...events,onPhase:p=>phases.push(p)})
    expect(result.state).toBe('ready');expect(result.title).toBe('Moon Mail')
    expect(planGame).toHaveBeenCalledOnce();expect(service.getConfig).toHaveBeenCalledOnce()
    expect(cartridges.get(result.id)?.template.characters[0].name).toBe('Pip')
    expect(jobs.at(-1)?.templateKey).toBe(templateKey(cartridges.get(result.id)!.template))
    expect(phases).toEqual(['settings','plan','save','code','test-code','art','test-art','ready'])
    expect(request.prompt).toBe('A penguin courier delivers letters on the moon.')
  })
  it('takes a snapshot before awaiting planning and preserves optional ROM tile references', async () => {
    const {service,events,cartridges}=setup()
    const reference={image:'data:image/png;base64,fixture',label:'Original tile page'}
    const request={prompt:'Moon penguin delivery game.',reference,apiKey:'',withArt:false}
    const planGame=vi.fn(async()=>quickPlan)
    const pending=runPromptGeneration(request,{...service,planGame},events)
    request.prompt='Edited while building'; reference.label='Another ROM'
    const result=await pending
    expect(planGame.mock.calls[0]).toEqual(['Moon penguin delivery game.',{image:'data:image/png;base64,fixture',label:'Original tile page'},'test-token',''])
    expect(cartridges.get(result.id)?.template.referenceTiles?.label).toBe('Original tile page')
  })
  it('does not buy code or art when planning fails or a key is missing', async () => {
    for(const hasKey of [false,true]) {
      const {service,events}=setup(hasKey)
      const planGame=vi.fn(async()=>{throw new Error('Planning unavailable')})
      await expect(runPromptGeneration({prompt:'Moon penguin delivery game.',apiKey:'',withArt:true},{...service,planGame},events)).rejects.toThrow()
      expect(service.createGame).not.toHaveBeenCalled();expect(service.generateStep).not.toHaveBeenCalled()
      expect(planGame).toHaveBeenCalledTimes(hasKey?1:0)
    }
  })
  it('keeps a failed quick-build cartridge available for explicit resume', async () => {
    const {service,events,jobs}=setup()
    service.generateStep.mockRejectedValueOnce(new Error('Provider unavailable'))
    const planGame=vi.fn(async()=>quickPlan)
    await expect(runPromptGeneration({prompt:'Moon penguin delivery game.',apiKey:'',withArt:true},{...service,planGame},events)).rejects.toThrow('Provider unavailable')
    const saved=jobs.at(-1)!
    expect(saved.status).toBe('failed')
    const result=await runGeneration({template:exampleTemplate(),apiKey:'',withArt:true,resumeId:saved.id},service,events)
    expect(result.id).toBe(saved.id);expect(result.title).toBe('Moon Mail');expect(planGame).toHaveBeenCalledOnce()
  })
})
