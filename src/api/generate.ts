import { jobSnapshot } from '../model/mockJob'
import type { GameTemplate, GenerationJob } from '../model/types'

// Client for the (stubbed) generation service. Talks to the local mock endpoint
// served by the Vite plugin; if that isn't available (e.g. static hosting), it
// falls back to an in-browser mock with identical behavior.

const local = new Map<string, { template: GameTemplate; createdAt: number }>()

export async function startGeneration(template: GameTemplate): Promise<GenerationJob> {
  try {
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as GenerationJob
  } catch {
    const id = `local_${Date.now().toString(36)}`
    const createdAt = Date.now()
    local.set(id, { template, createdAt })
    return jobSnapshot(id, template, createdAt, createdAt)
  }
}

export async function pollJob(id: string): Promise<GenerationJob> {
  const l = local.get(id)
  if (l) return jobSnapshot(id, l.template, l.createdAt, Date.now())
  const r = await fetch(`/api/jobs/${id}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as GenerationJob
}
