import { defineConfig } from 'vitest/config'

// Keep the offline unit suite independent of the application's Spark/Azure Vite plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
