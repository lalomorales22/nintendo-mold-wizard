import { describe, expect, it } from 'vitest'
import { MOLDS } from './molds'
import { loadState, saveState, STORAGE_KEY } from './storage'
import { applyPerspective, emptyTemplate, newCharacter, newLevel, validateTemplate } from './template'
import { PERSPECTIVE_IDS } from './types'
import { blockReason, initialState, matchingJob, templateKey, wizardReducer, type WizardAction, type WizardState } from './wizard'

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

describe('cartridge identity follows the exact draft', () => {
  const generated = (): WizardState => {
    const s = filled()
    return { ...s, step: 'review', maxReached: 5, job: {
      id: 'old-cartridge', templateKey: templateKey(s.template), status: 'done', progress: 100,
      createdAt: '2026-10-10T00:00:00Z', log: ['Saved'], result: { title: s.template.gameTitle, files: ['game.html'], note: 'Ready' },
    } }
  }
  it('clears Play after changing a title, even when all the previous game data is still present', () => {
    const s = generated()
    const changed = wizardReducer(s, { type: 'setMeta', patch: { gameTitle: 'Penguin Punch' } })
    expect(changed.template.gameTitle).toBe('Penguin Punch')
    expect(changed.job).toBeNull()
    expect(matchingJob(changed)).toBeNull()
    expect(s.job?.result?.title).toBe('Charge Quest')
  })
  it('invalidates the old cartridge for every meaningful template edit', () => {
    const s = generated()
    const cases: WizardAction[] = [
      { type: 'setMeta', patch: { pitch: 'An entirely different adventure' } },
      { type: 'setPerspective', id: 'fighting' },
      { type: 'upsertCharacter', character: { ...s.template.characters[0], description: 'Penguin boxer' } },
      { type: 'removeCharacter', id: s.template.characters[1].id },
      { type: 'upsertLevel', level: { ...s.template.levels[0], name: 'Boxing Ring' } },
      { type: 'removeLevel', id: s.template.levels[0].id },
      { type: 'setParameters', patch: { difficulty: 'hard' } },
    ]
    for (const action of cases) expect(wizardReducer(s, action).job, action.type).toBeNull()
    const twoLevels = { ...s, template: { ...s.template, levels: [...s.template.levels, { ...newLevel(), name: 'Second' }] } }
    twoLevels.job = { ...s.job!, templateKey: templateKey(twoLevels.template) }
    expect(wizardReducer(twoLevels, { type: 'moveLevel', id: twoLevels.template.levels[1].id, dir: -1 }).job).toBeNull()
  })
  it('keeps a matching cartridge when navigating or setting an unchanged value', () => {
    const s = generated()
    expect(wizardReducer(s, { type: 'back' }).job).toBe(s.job)
    expect(wizardReducer(s, { type: 'setMeta', patch: { gameTitle: s.template.gameTitle } }).job).toBe(s.job)
  })
  it('starts a clean project and ignores late results from the previous project', () => {
    const old = generated()
    const fresh = wizardReducer(old, { type: 'reset' })
    expect(fresh.template.gameTitle).toBe('')
    expect(fresh.template.characters).toEqual([])
    expect(fresh.template.levels).toEqual([])
    expect(fresh.step).toBe('welcome')
    expect(fresh.maxReached).toBe(0)
    expect(fresh.job).toBeNull()
    expect(wizardReducer(fresh, { type: 'setJob', job: old.job })).toBe(fresh)
  })
  it('migrates existing saved drafts without reattaching unverified or mismatched jobs', () => {
    const s = generated()
    const load = (value: unknown) => loadState({ getItem: () => JSON.stringify(value) })
    expect(load(s).job?.id).toBe('old-cartridge')
    const legacy = { ...s, job: { ...s.job, templateKey: undefined } }
    expect(load(legacy).job).toBeNull()
    expect(load(legacy).template).toEqual(s.template)
    expect(load({ ...s, template: { ...s.template, pitch: 'Different game, same title' } }).job).toBeNull()
  })
})
