export interface RomProject {
  id: string; name: string; system: 'NES' | 'SNES'; original: Uint8Array; modified: Uint8Array; importedAt: string; savedAt: string
}
export type RomSummary = Omit<RomProject, 'original' | 'modified'> & { size: number }
export const summarizeRom = (p: RomProject): RomSummary => ({ id: p.id, name: p.name, system: p.system, importedAt: p.importedAt, savedAt: p.savedAt, size: p.modified.length })
let connection: Promise<IDBDatabase> | undefined
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('ROM storage is unavailable in this browser. You can still edit and export files.')); return }
    const request = indexedDB.open('moldforge-rom-lab', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open local ROM storage. Check browser storage permissions.'))
  })
  return connection
}
export async function saveRom(project: RomProject): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite')
    tx.objectStore('projects').put(project)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(new Error('Could not save this ROM locally. Export your modified ROM before leaving; browser storage may be full.'))
  })
}
export async function getRom(id: string): Promise<RomProject> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects', 'readonly').objectStore('projects').get(id)
    request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('This local ROM project is no longer available.'))
    request.onerror = () => reject(new Error('Could not read this ROM project.'))
  })
}
export async function listRoms(): Promise<RomSummary[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const summaries: RomSummary[] = []
    const request = db.transaction('projects', 'readonly').objectStore('projects').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { resolve(summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))); return }
      summaries.push(summarizeRom(cursor.value)); cursor.continue()
    }
    request.onerror = () => reject(new Error('Could not read your local ROM shelf.'))
  })
}
