import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createContext, Script } from 'node:vm'
import { exampleTemplate } from '../src/model/template'
import type { ApiConfig, Cartridge } from '../src/model/types'

let php: ChildProcess, fixture: Server, port: number, directory: string, base: string
let cookie = '', csrf = '', codeCalls = 0, imageCalls = 0, imageFailure = false
let planMode = 'valid'
let codeOverride = ''
let codeMode = 'valid', gameId = '', demoHtml = ''
const key = 'sk-fixture-not-a-real-key-1234567890'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII='
const tilePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAABACAYAAAD1Xam+AAAA4UlEQVR4nO3UIQEAIBDAwM9ECELQvwfEQOzE+anN2ucCTfM7APjHACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDMACDsAYi+Rs0dAR0HAAAAAElFTkSuQmCC'
const generatedCode = 'function createGame(api){let score=0;return {update(dt){score+=dt;api.report({score,level:1,won:false})},render(ctx){ctx.fillRect(0,0,768,432);api.sprite(ctx,0,10,10,32,32)},save(){return {score}},load(d){if(d&&Number.isFinite(d.score))score=d.score}}}'
type TestResponse = Omit<Response, 'json'> & { json(): Promise<ApiConfig & Cartridge & { game: Cartridge; games: Cartridge[] }> }
async function call(action: string, body?: object, opts: { id?: string; key?: string; cookie?: string; csrf?: string } = {}) {
  return fetch(`${base}?action=${action}${opts.id ? `&id=${opts.id}` : ''}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: opts.cookie ?? cookie,
      'X-CSRF-Token': opts.csrf ?? csrf, ...(opts.key ? { 'X-OpenAI-Key': opts.key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as Promise<TestResponse>
}
async function startPhp() {
  php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'server', 'server/router.php'], { cwd: resolve('.'), stdio: 'ignore', env: {
    ...process.env, MOLDFORGE_DATA_DIR: directory, MOLDFORGE_LOCAL: '0', ALLOW_SERVER_KEY: 'false', OPENAI_API_KEY: '',
    MOLDFORGE_TEST: '1', MOLDFORGE_TEST_API: `http://127.0.0.1:${(fixture.address() as { port: number }).port}/v1`,
  } })
  for (let i = 0; i < 70; i++) {
    try { if ((await fetch(`${base}?action=config`)).ok) return } catch { /* wait for PHP */ }
    await new Promise(r => setTimeout(r, 40))
  }
  throw new Error('PHP test API failed to start')
}
async function stopPhp() { if (!php || php.exitCode !== null) return; await new Promise<void>(r => { php.once('exit', () => r()); php.kill() }) }
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moldforge-test-'))
  fixture = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const data = JSON.parse(raw)
    expect(req.headers.authorization).toBe(`Bearer ${key}`)
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/responses') {
      codeCalls++
      expect(data.store).toBe(false)
      expect(data.text.format.type).toBe('json_schema')
      expect(data.model).toBe('gpt-6-sol')
      if (data.text.format.name === 'game_plan') {
        expect(data.input[0].content[0].type).toBe('input_text')
        if(data.input[0].content.length>1) expect(data.input[0].content[1]).toMatchObject({type:'input_image',image_url:tilePng})
        res.end(JSON.stringify({ status:'completed', output:[{content:[{type:'output_text',text:JSON.stringify(planMode==='valid'?planFixture:{...planFixture,levels:[],perspective:'made-up'})}]}] })); return
      }
      const input = JSON.parse(typeof data.input === 'string' ? data.input : data.input[0].content[0].text)
      expect((input.template || input).gameTitle).toBe('Charge Quest')
      if(Array.isArray(data.input)) expect(data.input[0].content[1]).toMatchObject({type:'input_image',image_url:tilePng})
      if (codeMode === 'quota') { res.statusCode = 429; res.end(JSON.stringify({ error: { code: 'insufficient_quota', message: key } })); return }
      const payload = codeMode === 'invalid' ? {} : { summary: 'Generated playable test game', instructions: 'Arrows move.', artPrompt: 'Original pixel atlas', code: codeOverride || generatedCode }
      res.end(JSON.stringify({ status: codeMode === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }))
    } else if (req.url === '/v1/images/generations') {
      imageCalls++; expect(data.output_format).toBe('png'); expect(data.prompt).toContain('3 columns by 2 rows')
      if (imageFailure) { res.statusCode=403; res.end(JSON.stringify({ error: { message: key } })) }
      else res.end(JSON.stringify({ data: [{ b64_json: png }] }))
    } else { res.statusCode=404; res.end('{}') }
  })
  await new Promise<void>(r => fixture.listen(0, '127.0.0.1', r))
  const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r)); port=(reserve.address() as { port: number }).port
  await new Promise<void>(r => reserve.close(() => r()))
  base = `http://127.0.0.1:${port}/api.php`
  await startPhp()
  const config=await fetch(`${base}?action=config`); cookie=config.headers.get('set-cookie')!.split(';')[0]; csrf=(await config.json() as ApiConfig).csrf
})
afterAll(async () => { await stopPhp(); await new Promise<void>(r => fixture?.close(() => r())); if (directory) await rm(directory, { recursive: true, force: true }) })


const planFixture = { title: 'Ice Ring', pitch: 'A penguin boxing adventure.', perspective: 'fighting', coreLoop: 'Block, punch and win each round.', visualStyle: 'Chunky icy silhouettes.', observations: 'No tile image supplied.', assumptions: 'Three rounds are proposed.', hero: { name:'Pip',description:'Penguin boxer',ability:'Punch',abilityDescription:'Z launches a short punch.' }, enemy:{name:'Rival',description:'A slow heavy opponent'},levels:[{name:'Ice rink',layout:'Flat arena with two fighters.',goal:'Win the round'}],win:'Win every round',lose:'Lose all lives' }
async function accept(id: string) {
  const g=(await (await call('get',undefined,{id})).json()).game
  return (await call('validate',{id,buildHash:g.buildHash,passed:true})).json()
}

describe('PHP game pipeline', () => {
  it('requires a key, valid data, a same-browser CSRF token and correct HTTP methods', async () => {
    expect((await call('create', { template: exampleTemplate(), requestId: 'no-key-test' })).status).toBe(401)
    expect((await call('demo', { template: exampleTemplate(), requestId: 'csrf-test' }, { csrf: '' })).status).toBe(403)
    expect((await call('demo', { template: { version: 1 }, requestId: 'invalid-test' })).status).toBe(400)
    expect((await call('create')).status).toBe(405)
    expect((await fetch(`http://127.0.0.1:${port}/.env`)).status).toBe(404)
    expect((await (await call('config')).json()).serverKeyAvailable).toBe(false)
  })
  it('builds a real starter without a key, with sandboxed playable HTML', async () => {
    const r=await call('demo', { template: exampleTemplate(), requestId: 'demo-first-test' })
    expect(r.status).toBe(201)
    const g=await r.json() as Cartridge; expect(g.state).toBe('ready'); expect(g.provider).toBe('starter')
    const play=await call('play', undefined, { id: g.id }); demoHtml=await play.text()
    expect(play.headers.get('content-security-policy')).toContain('sandbox allow-scripts')
    expect(play.headers.get('content-security-policy')).not.toContain('allow-same-origin')
    expect(demoHtml).toContain('function createGame(api)')
    for (const [, code] of demoHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Script(code)).not.toThrow()
    const download=await call('download', undefined, { id: g.id }); expect(download.headers.get('content-disposition')).toContain('attachment')
    expect(await download.text()).toBe(demoHtml)
  })
  it('keeps script tags and packaging placeholders in template text inert', async () => {
    const template = exampleTemplate(); template.gameTitle = '__CODE__ </script><script>broken()</script>'
    const g = await (await call('demo', { template, requestId: 'escaped-title-test' })).json()
    const html = await (await call('play', undefined, { id: g.id })).text()
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    expect(scripts.length).toBe(3)
    for (const [, code] of scripts) expect(() => new Script(code)).not.toThrow()
    expect(JSON.parse(html.match(/const CONFIG=(.+);/)![1]).template.gameTitle).toBe(template.gameTitle)
  })
  it('generates code, resumes artwork, embeds it and never repeats completed paid steps', async () => {
    const req={ template: exampleTemplate(), requestId: 'ai-first-test', withArt: true }
    const g=await (await call('create',req,{key})).json() as Cartridge; gameId=g.id
    const duplicate=await (await call('create',req,{key})).json() as Cartridge
    expect(duplicate.id).toBe(gameId)
    expect((await (await call('step',{id:gameId},{key})).json()).state).toBe('testing')
    expect((await accept(gameId)).state).toBe('code')
    imageFailure=true
    const failure=await call('step',{id:gameId},{key}); expect(failure.status).toBe(403); expect(await failure.text()).not.toContain(key)
    imageFailure=false
    expect((await (await call('step',{id:gameId},{key})).json()).state).toBe('testing')
    expect((await accept(gameId)).state).toBe('ready')
    await call('step',{id:gameId},{key})
    expect(codeCalls).toBe(1); expect(imageCalls).toBe(2)
    const html=await (await call('play',undefined,{id:gameId})).text()
    expect(JSON.parse(html.match(/const CONFIG=(.+);/)! [1]).art).toBe('data:image/png;base64,'+png); expect(html).toContain(generatedCode); expect(html).not.toContain(key)
    expect((await readFile(join(directory,'games.sqlite'))).includes(Buffer.from(key))).toBe(false)
  })
  it('keeps private games private and restricts updates to their owner', async () => {
    const strangerConfig=await call('config',undefined,{cookie:''})
    const strangerCookie=strangerConfig.headers.get('set-cookie')!.split(';')[0]
    const strangerCsrf=(await strangerConfig.json()).csrf
    expect((await call('play',undefined,{id:gameId,cookie:strangerCookie})).status).toBe(404)
    expect((await (await call('list',undefined,{cookie:strangerCookie})).json()).games).toEqual([])
    await call('publish',{id:gameId,published:true})
    expect((await call('play',undefined,{id:gameId,cookie:strangerCookie})).status).toBe(200)
    expect((await call('delete',{id:gameId},{cookie:strangerCookie,csrf:strangerCsrf})).status).toBe(404)
    expect((await (await fetch(`${base}?action=list&scope=community`)).json() as { games: Cartridge[] }).games.some((g:Cartridge)=>g.id===gameId)).toBe(true)
    await call('publish',{id:gameId,published:false})
    expect((await call('get',undefined,{id:gameId,cookie:strangerCookie})).status).toBe(404)
  })
  it('preserves cartridges across a PHP restart', async () => {
    await stopPhp(); await startPhp()
    expect((await (await call('get',undefined,{id:gameId})).json()).game.state).toBe('ready')
  })
  it('does not report quota, malformed or incomplete responses as success', async () => {
    for (const mode of ['quota','invalid','incomplete']) {
      codeMode=mode
      const g=await (await call('create',{template:exampleTemplate(),requestId:`failure-${mode}`,withArt:false},{key})).json()
      const r=await call('step',{id:g.id},{key}); expect(r.ok).toBe(false)
      expect((await (await call('get',undefined,{id:g.id})).json()).game.state).toBe('draft')
      expect((await call('play',undefined,{id:g.id})).status).toBe(409)
    }
    codeMode='valid'
  })
  it('can explicitly finish an existing coded cartridge without buying artwork', async () => {
    const g=await (await call('create',{template:exampleTemplate(),requestId:'skip-art-test',withArt:true},{key})).json()
    await call('step',{id:g.id},{key});await accept(g.id);const calls=imageCalls
    const result=await (await call('step',{id:g.id,skipArt:true})).json()
    expect(result.state).toBe('testing');expect((await accept(g.id)).state).toBe('ready');expect(result.hasArt).toBe(false);expect(imageCalls).toBe(calls)
  })
})

describe('actual starter gameplay', () => {
  function runtime() {
    const code=[...demoHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.startsWith('function createGame'))!
    const keys=new Set<string>(), edges=new Set<string>(), reports:unknown[]=[]
    const factory=new Script(`${code}; createGame`).runInNewContext()
    const api={width:768,height:432,template:exampleTemplate(),keys,pressed:(k:string)=>{const yes=edges.has(k);edges.delete(k);return yes},beep:()=>{},report:(v:unknown)=>reports.push(v)}
    const game=factory(api)
    const tick=(n:number)=>{for(let i=0;i<n;i++)game.update(1/60)}
    return {game,keys,edges,tick,reports}
  }
  it('starts, moves, jumps, collects, progresses through both levels and wins', () => {
    const {game,keys,edges,tick}=runtime()
    expect(game.save().screen).toBe('title');edges.add('Enter');tick(1);keys.add('ArrowRight');tick(60)
    expect(game.save().x).toBeGreaterThan(200)
    // A real checkpoint can resume at the reachable goal of each stage.
    game.load({level:0,score:100,lives:3,screen:'play',x:2210,coins:[]});tick(20);expect(game.save().level).toBe(1)
    game.load({level:1,score:100,lives:3,screen:'play',x:2210,coins:[]});tick(20);expect(game.save().screen).toBe('win')
    edges.add('Enter');tick(1);expect(game.save().screen).toBe('play');expect(game.save().level).toBe(0)
  })
  it('handles collisions, lose state and invalid checkpoints', () => {
    const {game,keys,edges,tick}=runtime();game.load({level:0,score:0,lives:1,screen:'play',x:50,coins:[]});tick(150);keys.add('ArrowRight');tick(600)
    expect(game.save().screen).toBe('lose');edges.add('Enter');tick(1);expect(game.save().lives).toBe(3)
    const original=game.save();game.load({level:-100,score:NaN,lives:99});expect(game.save()).toEqual(original)
  })
})


describe('runtime gate and AI plan API', () => {
  it('does not expose unfinished code, rejects stale results and retains errors for repair', async () => {
    const g=await (await call('create',{template:exampleTemplate(),requestId:'runtime-failure',withArt:false},{key})).json()
    const coded=await (await call('step',{id:g.id},{key})).json()
    expect(coded.state).toBe('testing')
    expect((await call('play',undefined,{id:g.id})).status).toBe(409)
    expect((await call('publish',{id:g.id,published:true})).status).toBe(400)
    expect((await call('validate',{id:g.id,buildHash:'wrong',passed:true})).status).toBe(409)
    expect((await call('validate',{id:g.id,buildHash:coded.buildHash,passed:false,error:'Missing render'})).status).toBe(422)
    expect((await (await call('get',undefined,{id:g.id})).json()).game.error).toBe('Missing render')
    expect((await call('repair',{id:g.id})).status).toBe(401)
    expect((await (await call('repair',{id:g.id},{key})).json()).state).toBe('testing')
    expect((await accept(g.id)).state).toBe('ready')
  })
  it('plans from a description, validates requests and rejects arbitrary image URLs', async () => {
    expect((await call('plan',{prompt:'A penguin boxing game'})).status).toBe(401)
    expect((await call('plan',{prompt:'tiny'},{key})).status).toBe(400)
    expect((await call('plan',{prompt:'A penguin boxing game',reference:{label:'tiles',image:'https://example.com/private'}},{key})).status).toBe(400)
    const result=await call('plan',{prompt:'A penguin boxing game'},{key})
    expect(result.status).toBe(200);expect(await result.json()).toEqual(planFixture)
    planMode='invalid'
    expect((await call('plan',{prompt:'A penguin boxing game'},{key})).status).toBe(502)
    planMode='valid'
  })
  it('retains selected tiles in the template, vision input and downloadable game', async () => {
    const reference={label:'NES preview at $004010',image:tilePng}
    expect((await call('plan',{prompt:'Use these tiles for a new adventure',reference},{key})).status).toBe(200)
    const template={...exampleTemplate(),referenceTiles:reference}
    const g=await (await call('create',{template,requestId:'tile-reference-test',withArt:false},{key})).json()
    await call('step',{id:g.id},{key});await accept(g.id)
    const html=await (await call('download',undefined,{id:g.id})).text()
    expect(JSON.parse(html.match(/const CONFIG=(.+);/)![1]).template.referenceTiles).toEqual(reference)
    expect(html).toContain('tile(c,index,x,y,w,h)')
    expect(html).not.toContain(key)
  })
  async function runProbe(code: string, perspective = 'first-person', withArt = false) {
    codeOverride=code
    const template={...exampleTemplate(),perspective}
    const g=await (await call('create',{template,requestId:crypto.randomUUID(),withArt},{key})).json()
    await call('step',{id:g.id},{key});codeOverride=''
    if(withArt){await accept(g.id);await call('step',{id:g.id},{key})}
    const html=await (await call('probe',undefined,{id:g.id})).text()
    const messages:{type:string;message?:string}[]=[]
    const element={style:{},textContent:'',getContext:()=>ctx,addEventListener:()=>{},focus:()=>{}}
    const ctx={fillRect:()=>{},save:()=>{},restore:()=>{},drawImage:()=>{}}
    class TestImage { width=1536; height=1024; async decode(){} }
    const listeners:Record<string,(e:{message:string;filename?:string})=>void>={}
    const context=createContext({document:{querySelector:()=>element,getElementById:()=>element,querySelectorAll:()=>[],addEventListener:()=>{}},parent:{postMessage:(v:{type:string;message?:string})=>messages.push(v)},window:{addEventListener:(name:string,fn:(e:{message:string})=>void)=>{listeners[name]=fn}},console,Set,Image:TestImage})
    for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      try { await new Script(script).runInContext(context,{timeout:1000}) }
      catch(e) { listeners.error?.({message:(e as Error).message,filename:script.match(/sourceURL=(.+)/)?.[1]}) }
    }
    return messages
  }
  it('exercises the actual sandbox probe across every supported perspective', async () => {
    for(const perspective of ['top-down','side-view','first-person','isometric','rail-shooter','fighting','platformer-2d','3d-adventure']) {
      const messages=await runProbe(generatedCode,perspective)
      expect(messages.at(-1),JSON.stringify(messages)).toMatchObject({type:'moldforge-tested'})
    }
  })
  it('tests both drawn fallbacks and loaded sprite artwork', async () => {
    expect((await runProbe(generatedCode,'platformer-2d',true)).at(-1)?.type).toBe('moldforge-tested')
  })
  it('catches syntax, missing methods, input-path failures and checkpoint failures', async () => {
    const broken=[generatedCode.slice(0,-1),generatedCode.replace('render(ctx)','draw(ctx)'),generatedCode.replace('score+=dt','if(api.keys.has("ArrowRight"))missingHelper();score+=dt'),generatedCode.replace('if(d&&Number.isFinite(d.score))','if(Number.isFinite(d.score))'),generatedCode.replace('ctx.fillRect(0,0,768,432);api.sprite(ctx,0,10,10,32,32)',''),generatedCode.replace('ctx.fillRect(0,0,768,432)','ctx.fillRect(NaN,0,768,432)')]
    for(const code of broken) {
      const result=await runProbe(code)
      expect(result.some(m=>m.type==='moldforge-tested')).toBe(false)
      expect(result[0]?.type).toBe('moldforge-error')
      expect(result[0]?.message).not.toBe('createGame is not defined')
    }
  })
})


describe('player error attribution', () => {
  type BrowserError = { message?: string; filename?: string; error?: { stack: string }; reason?: { message?: string; stack?: string } }
  function bootstrap() {
    const script=[...demoHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1]
    const id=JSON.parse(script.match(/const CONFIG=(.+);/)![1]).id
    const messages:{type:string;message?:string}[]=[]
    const listeners:Record<string,(event:BrowserError)=>void>={}
    const failureElement={style:{display:'none'},textContent:''}
    const context=createContext({window:{addEventListener:(name:string,fn:(event:BrowserError)=>void)=>{listeners[name]=fn}},parent:{postMessage:(value:{type:string;message?:string})=>messages.push(value)},document:{getElementById:()=>failureElement}})
    new Script(script).runInContext(context)
    return {id,listeners,messages,failureElement}
  }
  it('keeps injected wallet and storage errors out of the game failure banner', () => {
    const {listeners,messages,failureElement}=bootstrap()
    listeners.error({message:'Failed to connect to MetaMask',filename:'chrome-extension://wallet/inpage.js',error:{stack:'Error at chrome-extension://wallet/inpage.js:1:22'}})
    listeners.error({message:'Cannot read sessionStorage',filename:'moz-extension://extension/contentScript.js'})
    listeners.error({message:'Possible EventEmitter memory leak detected',filename:'contentscript.js'})
    listeners.unhandledrejection({reason:{message:'Failed to connect to MetaMask',stack:'Error at chrome-extension://wallet/inpage.js:1:2'}})
    listeners.unhandledrejection({reason:{message:'Failed to connect to MetaMask'}})
    expect(messages).toEqual([])
    expect(failureElement.style.display).toBe('none')
  })
  it('still reports cartridge syntax errors and preserves the first genuine error', () => {
    const {id,listeners,messages}=bootstrap()
    listeners.error({message:'Unexpected token',filename:`game-maker-cartridge-${id}.js`})
    listeners.error({message:'createGame is not defined',filename:`game-maker-player-${id}.js`})
    expect(messages).toEqual([{type:'moldforge-error',message:'Unexpected token'}])
  })
  it('attributes game and host promise failures by source, not by message wording', () => {
    for(const source of ['cartridge','player']) {
      const {id,listeners,messages}=bootstrap()
      listeners.unhandledrejection({reason:{message:'Failed to connect to MetaMask',stack:`Error at createGame (game-maker-${source}-${id}.js:12:3)`}})
      expect(messages).toEqual([{type:'moldforge-error',message:'Failed to connect to MetaMask'}])
    }
  })
})
