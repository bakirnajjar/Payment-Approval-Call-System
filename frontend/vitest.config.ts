import { defineConfig } from 'vitest/config'

// Keep application-only Spark and build plugins out of the offline unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
