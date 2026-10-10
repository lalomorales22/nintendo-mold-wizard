import type { ApiConfig, Cartridge, GameTemplate } from '../model/types'

const endpoint = `${import.meta.env.BASE_URL}api.php`
export const apiUrl = (action: string, id?: string) => `${endpoint}?${new URLSearchParams({ action, ...(id ? { id } : {}) })}`

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(url, { ...init, credentials: 'same-origin', signal: AbortSignal.timeout(225000) }) }
  catch { throw new Error('The game server could not be reached. Your draft is saved. Check the connection and resume from your gallery.') }
  let data: T & { error?: string }
  try { data = await response.json() }
  catch { throw new Error('The PHP game API is unavailable. Start with npm run dev, or enable PHP on your host.') }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}
export const getConfig = () => request<ApiConfig>(apiUrl('config'))
export const getGame = (id: string) => request<{ game: Cartridge; template: GameTemplate }>(apiUrl('get', id))
export const listGames = (scope: 'mine' | 'community', offset = 0) => request<{ games: Cartridge[]; hasMore: boolean }>(`${apiUrl('list')}&scope=${scope}&offset=${offset}`)
export function mutate<T>(action: string, data: unknown, csrf: string, key = '') {
  return request<T>(apiUrl(action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...(key ? { 'X-OpenAI-Key': key.trim() } : {}) },
    body: JSON.stringify(data),
  })
}
export const createGame = (template: GameTemplate, withArt: boolean, requestId: string, csrf: string, key: string, starter = false) => mutate<Cartridge>(starter ? 'demo' : 'create', { template, withArt, requestId }, csrf, key)
export const generateStep = (id: string, csrf: string, key: string, skipArt = false) => mutate<Cartridge>('step', { id, skipArt }, csrf, key)
