import { initialState, STEPS, type WizardState } from './wizard'

export const STORAGE_KEY = 'moldforge.wizard.v1'

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): WizardState {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as WizardState
    if (parsed?.template?.version !== 1 || !STEPS.includes(parsed.step)) return initialState()
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
