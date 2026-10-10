import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Script } from 'node:vm'
import { exampleTemplate } from '../src/model/template'
import type { ApiConfig, Cartridge } from '../src/model/types'

let php: ChildProcess, fixture: Server, port: number, directory: string, base: string
let cookie = '', csrf = '', codeCalls = 0, imageCalls = 0, imageFailure = false
let codeMode = 'valid', gameId = '', demoHtml = ''
const key = 'sk-fixture-not-a-real-key-1234567890'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5qkAAAAASUVORK5CYII='
const generatedCode = 'function createGame(api){let score=0;return {update(dt){score+=dt;api.report({score,level:1,won:false})},render(ctx){ctx.fillRect(0,0,768,432);api.sprite(ctx,0,10,10,32,32)},save(){return {score}},load(d){if(Number.isFinite(d.score))score=d.score}}}'
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
      expect(JSON.parse(data.input).gameTitle).toBe('Charge Quest')
      if (codeMode === 'quota') { res.statusCode = 429; res.end(JSON.stringify({ error: { code: 'insufficient_quota', message: key } })); return }
      const payload = codeMode === 'invalid' ? {} : { summary: 'Generated playable test game', instructions: 'Arrows move.', artPrompt: 'Original pixel atlas', code: generatedCode }
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
    expect((await (await call('step',{id:gameId},{key})).json()).state).toBe('code')
    imageFailure=true
    const failure=await call('step',{id:gameId},{key}); expect(failure.status).toBe(403); expect(await failure.text()).not.toContain(key)
    imageFailure=false
    expect((await (await call('step',{id:gameId},{key})).json()).state).toBe('ready')
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
    await call('step',{id:g.id},{key});const calls=imageCalls
    const result=await (await call('step',{id:g.id,skipArt:true})).json()
    expect(result.state).toBe('ready');expect(result.hasArt).toBe(false);expect(imageCalls).toBe(calls)
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
