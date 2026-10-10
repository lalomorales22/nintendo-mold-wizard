import { initialState, STEPS, type WizardState } from './wizard'

export const STORAGE_KEY = 'moldforge.wizard.v1'

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): WizardState {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as WizardState
    if (parsed?.template?.version !== 1 || !STEPS.includes(parsed.step)) return initialState()
    const t = parsed.template
    if (typeof t.gameTitle !== 'string' || typeof t.pitch !== 'string' || !Array.isArray(t.characters) || !Array.isArray(t.levels) || !t.parameters?.physics || !Array.isArray(t.parameters.winConditions) || !Array.isArray(t.parameters.loseConditions)) return initialState()
    if (!Number.isInteger(parsed.maxReached) || parsed.maxReached < 0 || parsed.maxReached >= STEPS.length) return initialState()
    if (t.characters.some(c => typeof c.name !== 'string' || !c.stats || !Array.isArray(c.abilities) || !Array.isArray(c.assets)) || t.levels.some(l => typeof l.name !== 'string' || !Array.isArray(l.enemyIds) || !Array.isArray(l.collectibles) || !Array.isArray(l.exits) || !Array.isArray(l.musicMoodTags))) return initialState()
    return parsed
  } catch {
    return initialState()
  }
}

export function saveState(state: WizardState, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full or unavailable: ignore */
  }
}
