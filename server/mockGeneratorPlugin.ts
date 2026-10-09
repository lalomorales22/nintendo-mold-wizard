import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { jobSnapshot } from '../src/model/mockJob.ts'
import type { GameTemplate } from '../src/model/types.ts'

interface StoredJob { template: GameTemplate; createdAt: number }

/** Local-only stub of the future generation service. POST /api/generate, GET /api/jobs/:id */
export function mockGeneratorPlugin(): Plugin {
  const jobs = new Map<string, StoredJob>()

  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    const url = req.url ?? ''
    if (req.method === 'POST' && url === '/api/generate') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        try {
          const { template } = JSON.parse(raw) as { template: GameTemplate }
          if (!template?.gameTitle) return send(res, 400, { error: 'template.gameTitle required' })
          const id = `job_${Date.now().toString(36)}`
          const createdAt = Date.now()
          jobs.set(id, { template, createdAt })
          send(res, 202, jobSnapshot(id, template, createdAt, createdAt))
        } catch {
          send(res, 400, { error: 'invalid JSON' })
        }
      })
      return
    }
    const m = url.match(/^\/api\/jobs\/([\w-]+)$/)
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1])
      if (!job) return send(res, 404, { error: 'job not found' })
      return send(res, 200, jobSnapshot(m[1], job.template, job.createdAt, Date.now()))
    }
    next()
  }

  return {
    name: 'moldforge-mock-generator',
    configureServer(server) { server.middlewares.use(handler) },
    configurePreviewServer(server) { server.middlewares.use(handler) },
  }
}
