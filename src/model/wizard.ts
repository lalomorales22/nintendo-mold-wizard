// Wizard as a small typed state machine: steps, guards, and a reducer.
import { applyPerspective, emptyTemplate, exampleTemplate, validateTemplate } from './template'
import type { CharacterSheet, GameTemplate, GenerationJob, LevelSheet, PerspectiveId, SharedParameters } from './types'

export const STEPS = ['welcome', 'perspective', 'characters', 'levels', 'parameters', 'review'] as const
export type StepId = (typeof STEPS)[number]

export const STEP_LABELS: Record<StepId, string> = {
  welcome: 'Welcome',
  perspective: 'Perspective',
  characters: 'Characters',
  levels: 'Levels',
  parameters: 'Parameters',
  review: 'Review & Generate',
}

export interface WizardState {
  step: StepId
  /** Highest step index the user has unlocked (for clickable progress). */
  maxReached: number
  template: GameTemplate
  job: GenerationJob | null
}

export type WizardAction =
  | { type: 'goto'; step: StepId }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'setMeta'; patch: Partial<Pick<GameTemplate, 'gameTitle' | 'pitch' | 'productName'>> }
  | { type: 'setPerspective'; id: PerspectiveId }
  | { type: 'upsertCharacter'; character: CharacterSheet }
  | { type: 'removeCharacter'; id: string }
  | { type: 'upsertLevel'; level: LevelSheet }
  | { type: 'removeLevel'; id: string }
  | { type: 'moveLevel'; id: string; dir: -1 | 1 }
  | { type: 'setParameters'; patch: Partial<SharedParameters> }
  | { type: 'setJob'; job: GenerationJob | null }
  | { type: 'reset' }
  | { type: 'loadExample' }
  | { type: 'load'; state: WizardState }

export function initialState(): WizardState {
  return { step: 'welcome', maxReached: 0, template: emptyTemplate(), job: null }
}

export const stepIndex = (s: StepId) => STEPS.indexOf(s)

/** Guard: can the user leave this step going forward? Returns a reason when blocked. */
export function blockReason(state: WizardState, step: StepId = state.step): string | null {
  const t = state.template
  switch (step) {
    case 'welcome':
      return t.gameTitle.trim() ? null : 'Name your game to continue.'
    case 'perspective':
      return t.perspective ? null : 'Pick a perspective mold.'
    case 'characters':
      if (!t.characters.some((c) => c.role === 'hero')) return 'Add at least one hero.'
      if (t.characters.some((c) => !c.name.trim())) return 'Every character needs a name.'
      return null
    case 'levels':
      if (t.levels.length === 0) return 'Add at least one level.'
      if (t.levels.some((l) => !l.name.trim())) return 'Every level needs a name.'
      return null
    case 'parameters':
      return null
    case 'review':
      return validateTemplate(t).length ? 'Fix the issues listed above.' : null
  }
}

export function progress(state: WizardState): number {
  return Math.round((stepIndex(state.step) / (STEPS.length - 1)) * 100)
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) return [...list, item]
  const copy = list.slice()
  copy[i] = item
  return copy
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const t = state.template
  switch (action.type) {
    case 'goto': {
      const idx = stepIndex(action.step)
      // Can only jump to unlocked steps.
      if (idx > state.maxReached) return state
      return { ...state, step: action.step }
    }
    case 'next': {
      if (blockReason(state)) return state
      const idx = stepIndex(state.step)
      if (idx >= STEPS.length - 1) return state
      return { ...state, step: STEPS[idx + 1], maxReached: Math.max(state.maxReached, idx + 1) }
    }
    case 'back': {
      const idx = stepIndex(state.step)
      return idx === 0 ? state : { ...state, step: STEPS[idx - 1] }
    }
    case 'setMeta':
      return { ...state, template: { ...t, ...action.patch } }
    case 'setPerspective':
      return { ...state, template: applyPerspective(t, action.id) }
    case 'upsertCharacter':
      return { ...state, template: { ...t, characters: upsert(t.characters, action.character) } }
    case 'removeCharacter':
      return {
        ...state,
        template: {
          ...t,
          characters: t.characters.filter((c) => c.id !== action.id),
          levels: t.levels.map((l) => ({ ...l, enemyIds: l.enemyIds.filter((e) => e !== action.id) })),
        },
      }
    case 'upsertLevel':
      return { ...state, template: { ...t, levels: upsert(t.levels, action.level) } }
    case 'removeLevel':
      return { ...state, template: { ...t, levels: t.levels.filter((l) => l.id !== action.id) } }
    case 'moveLevel': {
      const i = t.levels.findIndex((l) => l.id === action.id)
      const j = i + action.dir
      if (i === -1 || j < 0 || j >= t.levels.length) return state
      const levels = t.levels.slice()
      ;[levels[i], levels[j]] = [levels[j], levels[i]]
      return { ...state, template: { ...t, levels } }
    }
    case 'setParameters':
      return { ...state, template: { ...t, parameters: { ...t.parameters, ...action.patch } } }
    case 'setJob':
      return { ...state, job: action.job }
    case 'reset':
      return initialState()
    case 'loadExample':
      return { step: 'welcome', maxReached: STEPS.length - 1, template: exampleTemplate(), job: null }
    case 'load':
      return action.state
  }
}
