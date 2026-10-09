import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { mockGeneratorPlugin } from './server/mockGeneratorPlugin.ts'

// The mock generator plugin serves /api/generate and /api/jobs/:id during `npm run dev`
// and `npm run preview`. It never calls any external/paid AI API.
export default defineConfig({
  plugins: [react(), tailwindcss(), mockGeneratorPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
