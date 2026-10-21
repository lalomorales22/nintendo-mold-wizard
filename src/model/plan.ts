import { applyPerspective, emptyTemplate, newCharacter, newLevel, uid } from './template'
import type { GameTemplate, PerspectiveId } from './types'

export interface TileReference { label: string; image: string }
export interface GamePlan {
  title: string; pitch: string; perspective: PerspectiveId; coreLoop: string; visualStyle: string
  observations: string; assumptions: string
  hero: { name: string; description: string; ability: string; abilityDescription: string }
  enemy: { name: string; description: string }
  levels: { name: string; layout: string; goal: string }[]
  win: string; lose: string
}
export function planToTemplate(plan: GamePlan, reference?: TileReference): GameTemplate {
  const template = applyPerspective(emptyTemplate(), plan.perspective)
  template.gameTitle = plan.title
  template.pitch = `${plan.pitch}\nPlay loop: ${plan.coreLoop}`
  const hero = newCharacter(plan.perspective, 'hero'), enemy = newCharacter(plan.perspective, 'enemy')
  hero.name = plan.hero.name; hero.description = plan.hero.description
  hero.abilities = [{ id: uid('ability'), name: plan.hero.ability, description: plan.hero.abilityDescription, input: 'Z / A' }]
  hero.assets = [{ kind: 'reference', value: plan.visualStyle }]
  enemy.name = plan.enemy.name; enemy.description = plan.enemy.description
  enemy.assets = [{ kind: 'reference', value: plan.visualStyle }]
  template.characters = [hero, enemy]
  template.levels = plan.levels.map(level => ({ ...newLevel(), name: level.name, layoutNotes: level.layout, enemyIds: [enemy.id], exits: [level.goal] }))
  template.parameters.winConditions = [plan.win]; template.parameters.loseConditions = [plan.lose]
  if (reference) template.referenceTiles = reference
  return template
}
