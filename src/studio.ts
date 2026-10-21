import { createContext, useContext } from 'react'
import type { ApiConfig, Cartridge, GameTemplate } from './model/types'

export interface Studio {
  config: ApiConfig | null
  apiKey: string
  setApiKey: (key: string) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  busy: boolean
  generationMessage: string
  withArt: boolean
  setWithArt: (enabled: boolean) => void
  newGame: () => void
  error: string | null
  setError: (error: string | null) => void
  revision: number
  refresh: () => void
  generate: (starter?: boolean, resumeId?: string, skipArt?: boolean, repair?: string | boolean) => Promise<void>
  play: (game: Cartridge) => void
  remix: (template: GameTemplate) => void
  showGallery: () => void
}
export const StudioContext = createContext<Studio | null>(null)
export function useStudio() {
  const studio = useContext(StudioContext)
  if (!studio) throw new Error('Studio is unavailable')
  return studio
}
