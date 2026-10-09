import { getMold } from './molds'
import type { CharacterRole, CharacterSheet, GameTemplate, LevelSheet, PerspectiveId, SharedParameters } from './types'

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

export const DEFAULT_PARAMETERS: SharedParameters = {
  difficulty: 'normal',
  camera: 'follow',
  physics: { gravity: 50, friction: 60, acceleration: 60, jumpEnabled: true },
  artStyle: '16-bit pixel',
  audioPalette: 'chiptune',
  lives: 3,
  winConditions: ['Reach the final exit'],
  loseConditions: ['HP reaches 0 with no lives left'],
}

export function emptyTemplate(): GameTemplate {
  return {
    version: 1,
    productName: 'Moldforge',
    gameTitle: '',
    pitch: '',
    perspective: null,
    characters: [],
    levels: [],
    parameters: structuredClone(DEFAULT_PARAMETERS),
  }
}

export function newCharacter(perspective: PerspectiveId | null, role: CharacterRole = 'hero'): CharacterSheet {
  const keys = getMold(perspective)?.statKeys ?? ['hp', 'attack', 'defense', 'speed']
  return {
    id: uid('chr'),
    name: '',
    role,
    description: '',
    stats: Object.fromEntries(keys.map((k) => [k, 50])),
    abilities: [],
    assets: [{ kind: 'sprite', value: '' }],
  }
}

export function newLevel(): LevelSheet {
  return { id: uid('lvl'), name: '', layoutNotes: '', enemyIds: [], collectibles: [], exits: [], musicMoodTags: [] }
}

/** Switching molds re-keys character stats and applies the mold's parameter defaults. */
export function applyPerspective(t: GameTemplate, id: PerspectiveId): GameTemplate {
  const mold = getMold(id)
  if (!mold) return t
  const characters = t.characters.map((c) => ({
    ...c,
    stats: Object.fromEntries(mold.statKeys.map((k) => [k, c.stats[k] ?? 50])),
  }))
  const d = mold.defaults
  const parameters: SharedParameters = {
    ...t.parameters,
    ...d,
    physics: { ...t.parameters.physics, ...(d.physics ?? {}) },
  }
  return { ...t, perspective: id, characters, parameters }
}

export interface ValidationIssue {
  field: string
  message: string
}

export function validateTemplate(t: GameTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!t.gameTitle.trim()) issues.push({ field: 'gameTitle', message: 'Give the game a title.' })
  if (!t.perspective) issues.push({ field: 'perspective', message: 'Pick a perspective mold.' })
  if (!t.characters.some((c) => c.role === 'hero')) issues.push({ field: 'characters', message: 'Add at least one hero.' })
  t.characters.forEach((c, i) => {
    if (!c.name.trim()) issues.push({ field: `characters.${i}.name`, message: `Character #${i + 1} needs a name.` })
  })
  if (t.levels.length === 0) issues.push({ field: 'levels', message: 'Add at least one level.' })
  t.levels.forEach((l, i) => {
    if (!l.name.trim()) issues.push({ field: `levels.${i}.name`, message: `Level #${i + 1} needs a name.` })
  })
  if (t.parameters.winConditions.length === 0) issues.push({ field: 'parameters.winConditions', message: 'Add a win condition.' })
  if (t.parameters.loseConditions.length === 0) issues.push({ field: 'parameters.loseConditions', message: 'Add a lose condition.' })
  return issues
}

/** A filled-in sample so the whole wizard can be clicked through in seconds. */
export function exampleTemplate(): GameTemplate {
  let t = applyPerspective({ ...emptyTemplate(), gameTitle: 'Charge Quest', pitch: 'A late-night EV driver crosses town hunting for a free charger before the battery dies.' }, 'platformer-2d')
  const hero: CharacterSheet = { ...newCharacter('platformer-2d', 'hero'), name: 'Lalo', description: 'Night-shift driver with 7% battery and a plan.', abilities: [{ id: uid('abl'), name: 'Boost', description: 'Short burst of speed', input: 'B' }], assets: [{ kind: 'sprite', value: '16-bit side-view driver sprite, red jacket' }] }
  const enemy: CharacterSheet = { ...newCharacter('platformer-2d', 'enemy'), name: 'Range Anxiety', description: 'Floating battery icon that drains charge on contact.' }
  const boss: CharacterSheet = { ...newCharacter('platformer-2d', 'boss'), name: 'The Toll Booth', description: 'Gatekeeper at the border crossing.' }
  t = { ...t, characters: [hero, enemy, boss] }
  t.levels = [
    { ...newLevel(), name: '1-1 Pier at Midnight', layoutNotes: 'Flat intro run along the pier. Teach jump and boost.', enemyIds: [enemy.id], collectibles: ['battery cells'], exits: ['goal flag'], musicMoodTags: ['night', 'chill'] },
    { ...newLevel(), name: '1-2 Border Crossing', layoutNotes: 'Lanes of traffic as moving platforms. Boss at the end.', enemyIds: [enemy.id, boss.id], collectibles: ['battery cells', 'toll tokens'], exits: ['charger'], musicMoodTags: ['tense'] },
  ]
  return t
}
