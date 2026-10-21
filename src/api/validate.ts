import { apiUrl, getGame, mutate } from './generate'
import type { Cartridge } from '../model/types'

/** Run generated code only in the same opaque-origin sandbox used by the player. */
export async function validateGame(id: string, csrf: string): Promise<Cartridge> {
  const { game } = await getGame(id)
  const result = await new Promise<{ passed: boolean; error?: string }>(resolve => {
    const frame = document.createElement('iframe')
    frame.sandbox.add('allow-scripts')
    frame.title = 'Checking generated game'
    frame.style.cssText = 'position:fixed;left:-2000px;width:768px;height:432px;visibility:hidden'
    let done = false
    const finish = (result: { passed: boolean; error?: string }) => {
      if (done) return
      done = true
      clearTimeout(timer); window.removeEventListener('message', receive); frame.remove(); resolve(result)
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return
      if (event.data.type === 'moldforge-tested' && event.data.buildHash === game.buildHash) finish({ passed: true })
      if (event.data.type === 'moldforge-error') finish({ passed: false, error: String(event.data.message || 'Game startup failed.').slice(0, 400) })
    }
    const timer = window.setTimeout(() => finish({ passed: false, error: 'The game did not complete its runtime check within 25 seconds.' }), 25000)
    window.addEventListener('message', receive)
    frame.src = apiUrl('probe', id)
    document.body.append(frame)
  })
  return mutate<Cartridge>('validate', { id, buildHash: game.buildHash, ...result }, csrf)
}
export const repairGame = (id: string, csrf: string, key: string, error?: string) => mutate<Cartridge>('repair', { id, error }, csrf, key)
