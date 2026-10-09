import type { Dispatch } from 'react'
import type { WizardAction, WizardState } from '../model/wizard'

export interface StepProps {
  state: WizardState
  dispatch: Dispatch<WizardAction>
}
