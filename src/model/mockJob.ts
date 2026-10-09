// Deterministic mock "AI generation" job. Status is a pure function of elapsed time,
// so the dev-server endpoint and the in-browser fallback behave identically.
// No network calls, no paid APIs. Replace with a real pipeline later (see README).
import type { GameTemplate, GenerationJob, JobStatus } from './types.ts'

const PHASES: { status: JobStatus; untilMs: number; line: string }[] = [
  { status: 'queued', untilMs: 800, line: 'Job queued.' },
  { status: 'analyzing-template', untilMs: 2200, line: 'Reading mold, character sheets and level sheets...' },
  { status: 'generating-assets', untilMs: 4200, line: 'Generating placeholder sprites/models from asset refs...' },
  { status: 'building-levels', untilMs: 6000, line: 'Laying out levels from layout notes...' },
  { status: 'packaging', untilMs: 7000, line: 'Packaging playable build...' },
]
export const TOTAL_MS = PHASES[PHASES.length - 1].untilMs

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'

export function jobSnapshot(id: string, template: GameTemplate, createdAt: number, now: number): GenerationJob {
  const elapsed = Math.max(0, now - createdAt)
  const reached = PHASES.filter((_p, i) => elapsed >= (i === 0 ? 0 : PHASES[i - 1].untilMs))
  const base = { id, createdAt: new Date(createdAt).toISOString(), log: reached.map((p) => p.line) }
  if (elapsed >= TOTAL_MS) {
    const s = slug(template.gameTitle)
    return {
      ...base,
      status: 'done',
      progress: 100,
      log: [...base.log, 'Done (mock). No real game was generated yet.'],
      result: {
        title: template.gameTitle,
        files: [
          `${s}/template.json`,
          `${s}/src/main.ts`,
          ...template.characters.map((c) => `${s}/src/entities/${slug(c.name)}.ts`),
          ...template.levels.map((l) => `${s}/levels/${slug(l.name)}.json`),
          `${s}/index.html`,
        ],
        note: 'Mock manifest. Real codegen is a TODO; see README.',
      },
    }
  }
  const current = reached[reached.length - 1]
  return { ...base, status: current.status, progress: Math.min(99, Math.round((elapsed / TOTAL_MS) * 100)) }
}
