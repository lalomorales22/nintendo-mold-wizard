import { describe, expect, it } from 'vitest'
import { MOLDS } from './molds'
import { jobSnapshot, TOTAL_MS } from './mockJob'
import { loadState, saveState, STORAGE_KEY } from './storage'
import { applyPerspective, emptyTemplate, newCharacter, newLevel, validateTemplate } from './template'
import { PERSPECTIVE_IDS } from './types'
import { blockReason, initialState, wizardReducer, type WizardState } from './wizard'

const filled = (): WizardState => {
  let s = initialState()
  s = wizardReducer(s, { type: 'setMeta', patch: { gameTitle: 'Charge Quest' } })
  s = wizardReducer(s, { type: 'setPerspective', id: 'platformer-2d' })
  const hero = { ...newCharacter('platformer-2d'), name: 'Lalo' }
  const boss = { ...newCharacter('platformer-2d', 'boss'), name: 'Grid Lord' }
  s = wizardReducer(s, { type: 'upsertCharacter', character: hero })
  s = wizardReducer(s, { type: 'upsertCharacter', character: boss })
  s = wizardReducer(s, { type: 'upsertLevel', level: { ...newLevel(), name: '1-1', enemyIds: [boss.id] } })
  return s
}

describe('molds', () => {
  it('covers every perspective id exactly once', () => {
    expect(MOLDS.map((m) => m.id).sort()).toEqual([...PERSPECTIVE_IDS].sort())
  })
})

describe('template', () => {
  it('applyPerspective re-keys stats and applies defaults', () => {
    let t = emptyTemplate()
    t = { ...t, characters: [newCharacter('top-down')] }
    t = applyPerspective(t, 'rail-shooter')
    expect(Object.keys(t.characters[0].stats)).toEqual(['shield', 'firepower', 'agility', 'bombs'])
    expect(t.parameters.camera).toBe('on-rails')
    expect(t.parameters.physics.jumpEnabled).toBe(false)
  })
  it('validate flags an empty template', () => {
    expect(validateTemplate(emptyTemplate()).length).toBeGreaterThan(0)
    expect(validateTemplate(filled().template)).toEqual([])
  })
})

describe('wizard state machine', () => {
  it('blocks next until the step is satisfied', () => {
    const s = initialState()
    expect(blockReason(s)).toBeTruthy()
    expect(wizardReducer(s, { type: 'next' }).step).toBe('welcome')
  })
  it('walks all steps when filled and cannot jump ahead of maxReached', () => {
    let s = filled()
    expect(wizardReducer(s, { type: 'goto', step: 'review' }).step).toBe('welcome')
    for (let i = 0; i < 5; i++) s = wizardReducer(s, { type: 'next' })
    expect(s.step).toBe('review')
    s = wizardReducer(s, { type: 'goto', step: 'perspective' })
    expect(s.step).toBe('perspective')
    expect(wizardReducer(s, { type: 'goto', step: 'review' }).step).toBe('review')
  })
  it('removing a character strips it from levels', () => {
    const s = filled()
    const boss = s.template.characters.find((c) => c.role === 'boss')!
    const next = wizardReducer(s, { type: 'removeCharacter', id: boss.id })
    expect(next.template.levels[0].enemyIds).toEqual([])
  })
  it('moveLevel reorders', () => {
    let s = filled()
    s = wizardReducer(s, { type: 'upsertLevel', level: { ...newLevel(), name: '1-2' } })
    s = wizardReducer(s, { type: 'moveLevel', id: s.template.levels[1].id, dir: -1 })
    expect(s.template.levels.map((l) => l.name)).toEqual(['1-2', '1-1'])
  })
})

describe('example', () => {
  it('example template is valid and unlocks all steps', () => {
    const s = wizardReducer(initialState(), { type: 'loadExample' })
    expect(validateTemplate(s.template)).toEqual([])
    expect(wizardReducer(s, { type: 'goto', step: 'review' }).step).toBe('review')
  })
})

describe('storage', () => {
  it('round-trips and rejects garbage', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    const s = filled()
    saveState(s, store)
    expect(loadState(store)).toEqual(s)
    mem.set(STORAGE_KEY, '{nope')
    expect(loadState(store).step).toBe('welcome')
  })
})

describe('mock generation job', () => {
  it('progresses to done with a manifest', () => {
    const t = filled().template
    expect(jobSnapshot('j', t, 0, 0).status).toBe('queued')
    expect(jobSnapshot('j', t, 0, 3000).status).toBe('generating-assets')
    const done = jobSnapshot('j', t, 0, TOTAL_MS)
    expect(done.status).toBe('done')
    expect(done.result?.files).toContain('charge-quest/levels/1-1.json')
  })
})
