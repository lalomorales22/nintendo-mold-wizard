// Core data model for Moldforge.
// A "mold" is a reusable game-structure template distilled from a family of games
// (eventually extracted by REA; for now hand-authored in molds.ts).

export const PERSPECTIVE_IDS = [
  'top-down',
  'side-view',
  'first-person',
  'isometric',
  'rail-shooter',
  'fighting',
  'platformer-2d',
  '3d-adventure',
] as const
export type PerspectiveId = (typeof PERSPECTIVE_IDS)[number]

export type CameraMode = 'fixed' | 'scrolling' | 'follow' | 'orbit' | 'first-person' | 'on-rails' | 'arena'

export interface PerspectiveMold {
  id: PerspectiveId
  name: string
  tagline: string
  /** Genre families this mold describes, written generically (no copyrighted assets). */
  examples: string[]
  dimensions: '2D' | '2.5D' | '3D'
  defaultCamera: CameraMode
  /** Core verbs the player does in this mold. */
  coreVerbs: string[]
  /** Level structure this mold expects. */
  levelShape: 'rooms' | 'scrolling-stage' | 'arena' | 'track' | 'open-zone' | 'dungeon'
  /** Default stat keys characters get in this mold. */
  statKeys: string[]
  defaults: Partial<SharedParameters>
}

export const ROLES = ['hero', 'npc', 'enemy', 'boss'] as const
export type CharacterRole = (typeof ROLES)[number]

export interface Ability {
  id: string
  name: string
  description: string
  /** Optional input binding hint, e.g. "A", "B+Up". */
  input?: string
  cooldownSec?: number
}

export interface AssetRef {
  /** Placeholder until art generation exists: a prompt, file path, or URL. */
  kind: 'sprite' | 'model' | 'portrait' | 'reference'
  value: string
}

export interface CharacterSheet {
  id: string
  name: string
  role: CharacterRole
  description: string
  /** Stat key -> value 0..100. Keys come from the selected mold. */
  stats: Record<string, number>
  abilities: Ability[]
  assets: AssetRef[]
}

export interface LevelSheet {
  id: string
  name: string
  layoutNotes: string
  /** Character ids (role enemy/boss) that appear here. */
  enemyIds: string[]
  collectibles: string[]
  exits: string[]
  musicMoodTags: string[]
}

export const DIFFICULTIES = ['chill', 'normal', 'hard', 'brutal'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const ART_STYLES = ['8-bit pixel', '16-bit pixel', 'low-poly', 'cel-shaded', 'hand-drawn', 'voxel'] as const
export type ArtStyle = (typeof ART_STYLES)[number]

export const AUDIO_PALETTES = ['chiptune', 'FM synth', 'orchestral', 'lo-fi', 'rock', 'ambient'] as const
export type AudioPalette = (typeof AUDIO_PALETTES)[number]

export interface PhysicsFeel {
  /** 0 = floaty, 100 = heavy */
  gravity: number
  /** 0 = icy, 100 = instant stop */
  friction: number
  /** 0 = sluggish, 100 = twitchy */
  acceleration: number
  jumpEnabled: boolean
}

export interface SharedParameters {
  difficulty: Difficulty
  camera: CameraMode
  physics: PhysicsFeel
  artStyle: ArtStyle
  audioPalette: AudioPalette
  lives: number
  winConditions: string[]
  loseConditions: string[]
}

export interface GameTemplate {
  referenceTiles?: { image: string; label: string }
  version: 1
  productName: string
  gameTitle: string
  pitch: string
  perspective: PerspectiveId | null
  characters: CharacterSheet[]
  levels: LevelSheet[]
  parameters: SharedParameters
}

// Generation state persists with the draft; API keys never belong in this model.
export type JobStatus = 'queued' | 'analyzing-template' | 'generating-assets' | 'building-levels' | 'packaging' | 'done' | 'failed'
export interface GenerationJob {
  id: string
  /** Exact editor snapshot that produced this cartridge. Never reuse it after edits. */
  templateKey: string
  status: JobStatus
  progress: number
  log: string[]
  createdAt: string
  result?: { title: string; files: string[]; note: string }
}

export interface Cartridge {
  id: string
  title: string
  pitch: string
  perspective: PerspectiveId
  createdAt: string
  state: 'draft' | 'code' | 'testing' | 'ready'
  buildHash?: string
  provider: 'openai' | 'starter'
  withArt: boolean
  hasArt: boolean
  published: boolean
  owned: boolean
  summary: string
  instructions: string
  error: string | null
  levelCount: number
  artStyle: string
}
export interface ApiConfig {
  csrf: string
  serverKeyAvailable: boolean
  codeModel: string
  imageModel: string
}
