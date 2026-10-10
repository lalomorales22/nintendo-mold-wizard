import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const proxy = { '/api.php': { target: process.env.PHP_API_TARGET || 'http://127.0.0.1:8787', timeout: 240000, proxyTimeout: 240000 } }
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.moldforge/**', '**/server/**'] } },
  preview: { proxy },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'], testTimeout: 15000, hookTimeout: 15000 },
} as Parameters<typeof defineConfig>[0])
