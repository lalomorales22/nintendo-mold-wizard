import { describe, expect, it } from 'vitest'
import { planToTemplate, type GamePlan } from './plan'
import { MOLDS } from './molds'
import { validateTemplate } from './template'

const plan: GamePlan = { title:'Ice Ring',pitch:'Penguin boxing',perspective:'fighting',coreLoop:'Block and counter.',visualStyle:'Chunky pixel penguins.',observations:'Visible square shapes.',assumptions:'Boxer roles are proposed.',hero:{name:'Pip',description:'A small boxer',ability:'Punch',abilityDescription:'Z punches a nearby rival.'},enemy:{name:'Rival',description:'A slow bruiser'},levels:[{name:'Ice arena',layout:'Flat floor, safe spawn, one opponent.',goal:'Win the round'}],win:'Win all rounds',lose:'Lose all lives' }
describe('AI plans become usable game templates', () => {
  it.each(MOLDS)('creates valid defaults and linked character references for $id', mold => {
    const template=planToTemplate({...plan,perspective:mold.id})
    expect(validateTemplate(template)).toEqual([])
    expect(template.parameters.camera).toBe(mold.defaults.camera)
    expect(Object.keys(template.characters[0].stats)).toEqual(mold.statKeys)
    expect(template.levels[0].enemyIds).toEqual([template.characters[1].id])
    expect(template.characters[0].abilities[0].description).toBe(plan.hero.abilityDescription)
  })
  it('retains the decoded tile image and visual brief through serialization', () => {
    const reference={label:'NES CHR preview',image:'data:image/png;base64,fixture'}
    const template=JSON.parse(JSON.stringify(planToTemplate(plan,reference)))
    expect(template.referenceTiles).toEqual(reference)
    expect(template.characters[0].assets[0].value).toBe(plan.visualStyle)
    expect(planToTemplate(plan).referenceTiles).toBeUndefined()
  })
})
