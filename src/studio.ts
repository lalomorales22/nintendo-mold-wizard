import type { TileReference } from './model/plan'
import { createContext, useContext } from 'react'
import type { AiOptions, ApiConfig, Cartridge, CodeProvider, GameTemplate } from './model/types'

export interface Studio {
  config: ApiConfig | null
  apiKey: string
  setApiKey: (key: string) => void
  anthropicKey: string
  setAnthropicKey: (key: string) => void
  workspaceId: string
  setWorkspaceId: (id: string) => void
  provider: CodeProvider
  setProvider: (provider: CodeProvider) => void
  openaiModel: string
  setOpenaiModel: (model: string) => void
  anthropicModel: string
  setAnthropicModel: (model: string) => void
  aiOptions: AiOptions
  battle: (prompt: string, resumeId?: string) => Promise<void>
  arenaId: string | null
  arenaProgress: Partial<Record<CodeProvider, string>>
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
  quickGenerate: (prompt: string, reference?: TileReference) => Promise<void>
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
