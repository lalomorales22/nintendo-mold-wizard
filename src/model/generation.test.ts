import { describe, expect, it, vi } from 'vitest'
import { runArena } from './arena'
import { ApiKeyRequiredError, runGeneration, runPromptGeneration, type GenerationPhase } from './generation'
import type { GamePlan } from './plan'
import { exampleTemplate } from './template'
import type { AiOptions, ApiConfig, ArenaMatch, Cartridge, GameTemplate, GenerationJob } from './types'
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
    createGame: vi.fn(async (template: GameTemplate, withArt: boolean, _requestId: string, _csrf: string, _key: string, starter = false, options: AiOptions = {}): Promise<Cartridge> => {
      const game: Cartridge = { id: `cartridge-${++nextId}`, title: template.gameTitle, pitch: template.pitch, perspective: template.perspective!,
        state: starter ? 'ready' : 'draft', withArt, owned: true, hasArt: false, published: false, createdAt: '2026-10-10T00:00:00Z', provider: starter ? 'starter' : options.provider ?? 'openai', codeModel: options.model, arenaId: options.arenaId,
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
    expect(service.repairGame).toHaveBeenCalledWith(game.id, 'test-token', '', 'Missing helper', {})
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
    expect(planGame.mock.calls[0]).toEqual(['Moon penguin delivery game.',{image:'data:image/png;base64,fixture',label:'Original tile page'},'test-token','',undefined])
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


describe('provider selection and arena recovery', () => {
  it('runs Claude without OpenAI when art is disabled and keeps its selection across awaited work', async () => {
    const {service,events}=setup(false)
    const options: AiOptions={provider:'anthropic',model:'claude-sonnet-5-5',anthropicKey:'private-claude-key',workspaceId:'wrkspc_test'}
    const planGame=vi.fn(async()=>quickPlan)
    const pending=runPromptGeneration({prompt:'Penguin delivers moon letters',apiKey:'',withArt:false,options},{...service,planGame},events)
    options.provider='openai';options.model='gpt-other';options.anthropicKey='changed'
    const game=await pending
    expect(game.provider).toBe('anthropic');expect(game.codeModel).toBe('claude-sonnet-5-5')
    expect(planGame.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({provider:'anthropic',anthropicKey:'private-claude-key'})]))
    expect(service.generateStep).toHaveBeenCalledOnce()
  })
  it('requires both keys before paying Claude for a new game with OpenAI artwork', async () => {
    const {service,events}=setup(false),planGame=vi.fn(async()=>quickPlan)
    await expect(runPromptGeneration({prompt:'Penguin delivers moon letters',apiKey:'',withArt:true,options:{provider:'anthropic',anthropicKey:'claude-key'}},{...service,planGame},events)).rejects.toThrow('Connect OpenAI')
    expect(planGame).not.toHaveBeenCalled();expect(service.createGame).not.toHaveBeenCalled()
  })
  it('uses the saved provider for repairs but only requires OpenAI to finish existing Claude art', async () => {
    const {service,events,cartridges}=setup(false)
    const game=await runGeneration({template:exampleTemplate(),apiKey:'',withArt:false,options:{provider:'anthropic',anthropicKey:'claude-key'}},service,events)
    await expect(runGeneration({template:exampleTemplate(),apiKey:'openai-key',withArt:false,resumeId:game.id,repair:true,options:{provider:'openai'}},service,events)).rejects.toThrow('Connect Anthropic')
    expect(service.repairGame).not.toHaveBeenCalled()
    const saved=cartridges.get(game.id)!.game;saved.state='code';saved.withArt=true
    const result=await runGeneration({template:exampleTemplate(),apiKey:'openai-key',withArt:true,resumeId:game.id,options:{provider:'openai'}},service,events)
    expect(result.hasArt).toBe(true);expect(result.provider).toBe('anthropic')
  })
  it('keeps a successful opponent when one fails and resumes only the unfinished round', async () => {
    const {service,events,cartridges}=setup(true)
    const planGame=vi.fn(async()=>quickPlan)
    const match: ArenaMatch={id:'arena-fixture',prompt:'Penguin delivers moon letters',settings:{openai:'gpt-6-sol',anthropic:'claude-sonnet-5-5',withArt:false},games:[],createdAt:'2026-10-20T00:00:00Z',winner:null}
    service.generateStep.mockRejectedValueOnce(new Error('OpenAI temporarily unavailable'))
    const credentials: AiOptions={anthropicKey:'claude-key',provider:'openai',model:'ignored'}
    const errors=await runArena(match,'',credentials,{...service,planGame},()=>events)
    expect(errors).toEqual({openai:'OpenAI temporarily unavailable'})
    match.games=[...cartridges.values()].map(c=>c.game)
    expect(match.games.find(g=>g.provider==='anthropic')?.state).toBe('ready')
    expect(planGame).toHaveBeenCalledTimes(2);expect(service.repairGame).not.toHaveBeenCalled()
    expect(await runArena(match,'',{}, {...service,planGame},()=>events)).toEqual({})
    expect(service.createGame).toHaveBeenCalledTimes(2);expect(planGame).toHaveBeenCalledTimes(2)
    expect(service.generateStep).toHaveBeenCalledTimes(3)
    expect(match.games.every(g=>g.state==='ready')).toBe(true)
    expect(match.games.map(g=>g.codeModel)).toEqual(['gpt-6-sol','claude-sonnet-5-5'])
    expect(match.games.every(g=>g.arenaId===match.id)).toBe(true)
  })
})
