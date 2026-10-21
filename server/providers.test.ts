import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { exampleTemplate } from '../src/model/template'
import type { ApiConfig, ArenaMatch, Cartridge, GameTemplate } from '../src/model/types'

let php: ChildProcess, fixture: Server, directory: string, base: string, csrf: string
const legacyTemplate = exampleTemplate()
const cookie = `moldforge_owner=${'a'.repeat(64)}`
const openaiKey = 'sk-fixture-openai-private-12345', anthropicKey = 'sk-ant-fixture-private-12345'
const records: {url: string; method: string; headers: IncomingHttpHeaders; body: Record<string, unknown>}[] = []
let stopReason = 'end_turn', rejection = 0, invalidPlan = false
const code = 'function createGame(api){let x=40;return {update(dt){if(api.keys.has("ArrowRight"))x+=dt*80},render(ctx){ctx.fillRect(x,50,20,20);api.report({score:0,level:1,won:false})},save(){return {x}},load(d){if(d&&Number.isFinite(d.x))x=d.x}}}'
const payload = { summary:'A tiny test game', instructions:'Arrows move', artPrompt:'Penguin on ice', code }
const plan = {title:'Ice Delivery',pitch:'A penguin delivers mail.',perspective:'top-down',coreLoop:'Dodge and deliver.',visualStyle:'Pixel penguin.',observations:'Based on the description.',assumptions:'One short stage.',hero:{name:'Pip',description:'Penguin courier',ability:'Dash',abilityDescription:'Dash with Z'},enemy:{name:'Crab',description:'Moving crab'},levels:[{name:'Port',layout:'Paths around rocks',goal:'Reach the mailbox'}],win:'Deliver the mail',lose:'Lose all lives'}
const tilePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAABACAYAAAD1Xam+AAAA4UlEQVR4nO3UIQEAIBDAwM9ECELQvwfEQOzE+anN2ucCTfM7APjHACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDsAYi+Rs0dAR0HAAAAAElFTkSuQmCC'
type Options = {keys?: boolean; openai?: boolean; anthropic?: boolean; workspace?: string; cookie?: string; csrf?: string; id?: string}
type TestResponse = Omit<Response, 'json'> & { json(): Promise<ApiConfig & Cartridge & ArenaMatch & { game: Cartridge; template: GameTemplate; models: string[]; arenas: ArenaMatch[] }> }
async function call(action: string, body?: object, options: Options = {}) {
  return fetch(`${base}?action=${action}${options.id ? '&id='+options.id : ''}`, {method: body ? 'POST' : 'GET', headers:{'Content-Type':'application/json',Cookie:options.cookie??cookie,'X-CSRF-Token':options.csrf??csrf,
    ...(options.keys||options.openai?{'X-OpenAI-Key':openaiKey}:{}),...(options.keys||options.anthropic?{'X-Anthropic-Key':anthropicKey}:{}),...(options.workspace?{'X-Anthropic-Workspace':options.workspace}:{})},...(body?{body:JSON.stringify(body)}:{})}) as Promise<TestResponse>
}
async function create(requestId: string, withArt = false) {
  const response=await call('create',{template:exampleTemplate(),requestId,provider:'anthropic',model:'claude-opus-5-5',withArt},{anthropic:true})
  expect(response.status).toBe(201);return await response.json() as Cartridge
}
async function accept(id: string) {
  const {game}=await (await call('get',undefined,{id})).json() as {game:Cartridge}
  return await (await call('validate',{id,buildHash:game.buildHash,passed:true})).json() as Cartridge
}

beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'game-maker-providers-'))
  // Start from the pre-provider schema and an existing row to exercise an actual upgrade.
  const legacy=spawnSync('php',['-r',`$db=new PDO('sqlite:'.getenv('TEST_DB'));$db->exec('CREATE TABLE games (id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_id TEXT NOT NULL,template TEXT NOT NULL,payload TEXT,image TEXT,created_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT "draft",provider TEXT NOT NULL DEFAULT "openai",with_art INTEGER NOT NULL DEFAULT 1,published INTEGER NOT NULL DEFAULT 0,error TEXT,lease_until INTEGER NOT NULL DEFAULT 0,UNIQUE(owner,request_id))');$s=$db->prepare('INSERT INTO games(id,owner,request_id,template,created_at) VALUES(?,?,?,?,?)');$s->execute([str_repeat('b',32),getenv('TEST_OWNER'),'legacy-game',getenv('TEST_TEMPLATE'),gmdate('c')]);`],{env:{...process.env,TEST_DB:join(directory,'games.sqlite'),TEST_OWNER:createHash('sha256').update('a'.repeat(64)).digest('hex'),TEST_TEMPLATE:JSON.stringify(legacyTemplate)}})
  expect(legacy.status).toBe(0)
  fixture=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk
    const data=JSON.parse(raw||'{}');records.push({url:req.url!,method:req.method!,headers:req.headers,body:data})
    res.setHeader('Content-Type','application/json')
    if(req.headers['x-api-key']){
      res.setHeader('anthropic-organization-id','org_fixture');res.setHeader('anthropic-workspace-id','wrkspc_fixture')
      if(rejection){res.statusCode=rejection;res.end(JSON.stringify({error:{type:'invalid_request_error',message:`anthropic-workspace-id required ${anthropicKey}`}}));return}
      if(req.url?.startsWith('/v1/models')){res.end(JSON.stringify({data:[{id:'claude-opus-5-5'},{id:'claude-sonnet-5-5'}]}));return}
      const isPlan=!!data.output_config.format.schema.properties.hero
      res.end(JSON.stringify({stop_reason:stopReason,content:[{type:'text',text:JSON.stringify(isPlan?(invalidPlan?{...plan,levels:[]}:plan):payload)}]}));return
    }
    if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'gpt-6-sol'},{id:'gpt-image-1.5'}]}));return}
    if(req.url==='/v1/images/generations'){res.statusCode=403;res.end(JSON.stringify({error:{message:openaiKey}}));return}
    res.end(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(payload)}]}]}))
  })
  await new Promise<void>(r=>fixture.listen(0,'127.0.0.1',r))
  const reserve=createServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));const port=(reserve.address() as {port:number}).port;await new Promise<void>(r=>reserve.close(()=>r()))
  base=`http://127.0.0.1:${port}/api.php`
  const target=`http://127.0.0.1:${(fixture.address() as {port:number}).port}/v1`
  php=spawn('php',['-S',`127.0.0.1:${port}`,'-t','server','server/router.php'],{cwd:resolve('.'),stdio:'ignore',env:{...process.env,MOLDFORGE_DATA_DIR:directory,MOLDFORGE_ENV_FILE:join(directory,'absent.env'),MOLDFORGE_LOCAL:'1',ALLOW_SERVER_KEY:'false',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',ANTHROPIC_WORKSPACE_ID:'wrkspc_server_private',OPENAI_CODE_MODEL:'gpt-6-sol',ANTHROPIC_CODE_MODEL:'claude-sonnet-5-5',OPENAI_IMAGE_MODEL:'gpt-image-1.5',MOLDFORGE_TEST:'1',MOLDFORGE_TEST_API:target,MOLDFORGE_TEST_ANTHROPIC_API:target}})
  for(let i=0;i<70;i++){
    try{const r=await call('config');if(r.ok){csrf=(await r.json() as ApiConfig).csrf;return}}catch{/* wait for the isolated server */}
    await new Promise(r=>setTimeout(r,40))
  }
  throw new Error('Provider test server did not start')
})
afterAll(async()=>{if(php&&php.exitCode===null)await new Promise<void>(r=>{php.once('exit',()=>r());php.kill()});if(fixture)await new Promise<void>(r=>fixture.close(()=>r()));if(directory)await rm(directory,{recursive:true,force:true})})

describe('Claude credentials, contracts and saved identity',()=>{
  it('migrates existing games without replacing their contents',async()=>{
    const {game,template}=await (await call('get',undefined,{id:'b'.repeat(32)})).json()
    expect(game.title).toBe('Charge Quest');expect(game.provider).toBe('openai');expect(game.codeModel).toBeNull();expect(template).toEqual(legacyTemplate)
  })
  it('checks models with native headers and never inherits a private server workspace for BYOK',async()=>{
    const response=await call('models',{provider:'anthropic'},{keys:true})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({models:['claude-opus-5-5','claude-sonnet-5-5'],identity:{organization:'org_fixture',workspace:'wrkspc_fixture'}})
    expect(records.at(-1)).toMatchObject({method:'GET',body:{},headers:{'x-api-key':anthropicKey,'anthropic-version':'2023-06-01'}})
    expect(records.at(-1)!.headers.authorization).toBeUndefined();expect(records.at(-1)!.headers['anthropic-workspace-id']).toBeUndefined()
    await call('models',{provider:'anthropic'},{keys:true,workspace:'wrkspc_chosen'})
    expect(records.at(-1)!.headers['anthropic-workspace-id']).toBe('wrkspc_chosen')
    const openai=await call('models',{provider:'openai'},{keys:true});expect((await openai.json()).models).toEqual(['gpt-6-sol'])
    expect(records.at(-1)!.headers.authorization).toBe(`Bearer ${openaiKey}`);expect(records.at(-1)!.headers['x-api-key']).toBeUndefined()
    expect((await call('models',{provider:'anthropic'},{openai:true})).status).toBe(401)
    expect((await call('models',{provider:'anthropic'},{anthropic:true,workspace:'org_wrong'})).status).toBe(400)
  })
  it('translates schema and tile inputs while retaining local plan validation',async()=>{
    const body={prompt:'A penguin mail delivery game',provider:'anthropic',model:'claude-sonnet-5-5',reference:{label:'Tile page',image:tilePng}}
    expect(await (await call('plan',body,{anthropic:true})).json()).toEqual(plan)
    const data=records.at(-1)!.body
    expect(data).toMatchObject({model:'claude-sonnet-5-5',max_tokens:10000,output_config:{effort:'medium',format:{type:'json_schema'}}})
    expect(JSON.stringify(data)).not.toContain('"minLength":');expect(JSON.stringify(data)).toContain('minLength: 1.')
    expect(data.messages).toEqual([{role:'user',content:[expect.objectContaining({type:'text'}),{type:'image',source:{type:'base64',media_type:'image/png',data:tilePng.slice(22)}}]}])
    invalidPlan=true;expect((await call('plan',body,{anthropic:true})).status).toBe(502);invalidPlan=false
  })
  it('leaves custom model effort and existing output limits alone',async()=>{
    expect((await call('plan',{prompt:'A penguin mail delivery game',provider:'anthropic',model:'claude-custom'},{anthropic:true})).status).toBe(200)
    expect(records.at(-1)!.body.max_tokens).toBe(5000)
    expect(records.at(-1)!.body.output_config).not.toHaveProperty('effort')
  })
  it('pins Claude code/repair to its original model and routes art exclusively to OpenAI',async()=>{
    const g=await create('claude-art-build',true)
    expect(g.provider).toBe('anthropic');expect(g.codeModel).toBe('claude-opus-5-5')
    expect((await call('step',{id:g.id},{openai:true})).status).toBe(401)
    expect((await call('step',{id:g.id,provider:'openai',model:'gpt-changed'},{keys:true})).status).toBe(200)
    expect(records.at(-1)).toMatchObject({url:'/v1/messages',body:{model:'claude-opus-5-5',max_tokens:32000,output_config:{effort:'medium'}}})
    expect((await accept(g.id)).state).toBe('code')
    expect((await call('step',{id:g.id},{anthropic:true})).status).toBe(401)
    expect((await call('step',{id:g.id},{keys:true})).status).toBe(403)
    expect(records.at(-1)).toMatchObject({url:'/v1/images/generations',body:{model:'gpt-image-1.5'},headers:{authorization:`Bearer ${openaiKey}`}})
    expect(records.at(-1)!.headers['x-api-key']).toBeUndefined()
    const saved=await (await call('get',undefined,{id:g.id})).json();expect(saved.game.state).toBe('code')
    await call('step',{id:g.id,skipArt:true});expect((await accept(g.id)).state).toBe('ready')
    expect((await call('repair',{id:g.id,provider:'openai',model:'gpt-changed'},{anthropic:true})).status).toBe(200)
    expect(records.at(-1)).toMatchObject({url:'/v1/messages',body:{model:'claude-opus-5-5',max_tokens:32000,output_config:{effort:'medium'}}})
    await accept(g.id)
    const html=await (await call('download',undefined,{id:g.id})).text();expect(html).toContain(code)
    expect(html).not.toContain(anthropicKey);expect(html).not.toContain(openaiKey)
  })
  it('keeps failed drafts recoverable and returns safe refusal, truncation and workspace errors',async()=>{
    const g=await create('claude-failures')
    for(const reason of ['max_tokens','refusal','model_context_window_exceeded',`unexpected ${anthropicKey}`]){
      const before=records.length
      stopReason=reason;const r=await call('step',{id:g.id},{anthropic:true});expect(r.status).toBe(reason==='refusal'?422:502)
      const message=await r.text();expect(message).toContain('Claude');expect(message).not.toContain(anthropicKey)
      if(reason==='max_tokens'){expect(message).toContain('32,000-token response limit');expect(message).toContain('thinking')}
      if(reason==='model_context_window_exceeded')expect(message).toContain('context space')
      const saved=(await (await call('get',undefined,{id:g.id})).json()).game
      expect(saved.state).toBe('draft');expect(saved.error).not.toContain(anthropicKey)
      expect((await call('play',undefined,{id:g.id})).status).toBe(409)
      expect(records.length-before).toBe(1) // No hidden retries, even when truncated JSON is parseable.
    }
    stopReason='end_turn';rejection=400
    const r=await call('step',{id:g.id},{anthropic:true});const message=await r.text()
    expect(message).toContain('workspace ID');expect(message).not.toContain(anthropicKey);rejection=0
    expect((await call('step',{id:g.id},{anthropic:true})).status).toBe(200);expect((await accept(g.id)).state).toBe('ready')
  })
  it('identifies a truncated plan and preserves a working cartridge if repair truncates',async()=>{
    stopReason='max_tokens'
    try {
      const before=records.length
      const r=await call('plan',{prompt:'A penguin mail delivery game',provider:'anthropic',model:'claude-sonnet-5-5'},{anthropic:true})
      expect(r.status).toBe(502);expect(await r.text()).toContain('10,000-token response limit before finishing the plan')
      expect(records.length-before).toBe(1)
    } finally { stopReason='end_turn' }
    const g=await create('claude-preserved-repair');await call('step',{id:g.id},{anthropic:true});const ready=await accept(g.id)
    const html=await (await call('download',undefined,{id:g.id})).text()
    stopReason='max_tokens'
    try {
      expect((await call('repair',{id:g.id},{anthropic:true})).status).toBe(502)
      const saved=(await (await call('get',undefined,{id:g.id})).json()).game
      expect(saved.state).toBe('ready');expect(saved.buildHash).toBe(ready.buildHash)
      expect(await (await call('download',undefined,{id:g.id})).text()).toBe(html)
    } finally { stopReason='end_turn' }
  })
  it('persists a private match with pinned selections, one cartridge per provider and a saved verdict',async()=>{
    const request={prompt:'A penguin mail delivery battle',requestId:'match-fixture',openaiModel:'gpt-6-sol',anthropicModel:'claude-haiku-5-5',withArt:false}
    expect((await call('arena-create',request,{openai:true})).status).toBe(401)
    const response=await call('arena-create',request,{keys:true});expect(response.status).toBe(201)
    const match=await response.json() as ArenaMatch
    expect((await (await call('arena-create',request)).json()).id).toBe(match.id)
    expect((await call('arena-vote',{id:match.id,winner:'anthropic'})).status).toBe(400)
    for(const provider of ['openai','anthropic']){
      const req={template:exampleTemplate(),requestId:'match-'+provider,provider,model:provider==='anthropic'?'claude-changed':'gpt-changed',arenaId:match.id,withArt:true}
      const g=await (await call('create',req,{keys:true})).json() as Cartridge
      expect(g.withArt).toBe(false);expect(g.codeModel).toBe(provider==='anthropic'?'claude-haiku-5-5':'gpt-6-sol')
      expect((await (await call('create',{...req,requestId:req.requestId+'-duplicate'})).json()).id).toBe(g.id)
      await call('step',{id:g.id},{keys:true});await accept(g.id)
    }
    const voted=await (await call('arena-vote',{id:match.id,winner:'anthropic'})).json() as ArenaMatch
    expect(voted.games).toHaveLength(2);expect(voted.winner).toBe('anthropic')
    expect((await (await call('arenas')).json()).arenas[0].id).toBe(match.id)
    const strangerCookie=`moldforge_owner=${'c'.repeat(64)}`
    const strangerCsrf=(await (await call('config',undefined,{cookie:strangerCookie})).json()).csrf
    expect((await call('arena',undefined,{id:match.id,cookie:strangerCookie})).status).toBe(404)
    expect((await call('arena-vote',{id:match.id,winner:'openai'},{cookie:strangerCookie,csrf:strangerCsrf})).status).toBe(404)
    expect((await (await call('arenas',undefined,{cookie:strangerCookie})).json()).arenas).toEqual([])
  })
  it('never persists either provider key in SQLite or its write-ahead log',async()=>{
    for(const file of ['games.sqlite','games.sqlite-wal']){
      const bytes=await readFile(join(directory,file)).catch(()=>Buffer.alloc(0))
      expect(bytes.includes(Buffer.from(anthropicKey))).toBe(false);expect(bytes.includes(Buffer.from(openaiKey))).toBe(false)
      expect(bytes.includes(Buffer.from('wrkspc_server_private'))).toBe(false)
    }
  })
})
