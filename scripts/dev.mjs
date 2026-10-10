import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', 'server', 'server/router.php'], {
  cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOLDFORGE_LOCAL: '1' },
})
let vite
let stopping = false
function stop(code = 0) { if (stopping) return; stopping = true; php.kill(); vite?.kill(); process.exitCode = code }
php.on('error', () => { console.error('PHP 8.2+ with cURL is required. Install PHP, then run npm run dev.'); stop(1) })
php.on('exit', code => { if (!stopping) { console.error('PHP server stopped.'); stop(code || 1) } })
// PHP request logs stay local; never log request bodies or authorization headers.
php.stderr.on('data', data => { if (/Fatal error|Failed to listen/.test(String(data))) console.error(String(data)) })
for (let tries = 0; tries < 40; tries++) {
  try { const r = await fetch(`http://127.0.0.1:${port}/api.php?action=config`); if (r.ok) break } catch {}
  if (tries === 39) { console.error('PHP API did not start.'); stop(1); break }
  await new Promise(resolve => setTimeout(resolve, 100))
}
if (!stopping) {
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(process.argv.includes('--preview') ? ['preview'] : []), '--host', '127.0.0.1'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, PHP_API_TARGET: `http://127.0.0.1:${port}` },
  })
  vite.on('exit', code => stop(code || 0))
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
