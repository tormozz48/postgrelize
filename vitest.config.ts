import { defineConfig } from 'vitest/config';

const dbProject = (name: string) => ({
  test: {
    name,
    include: [`tests/${name}/**/*.test.ts`],
    globalSetup: ['tests/support/global-setup-db.ts'],
    testTimeout: 15_000,
  },
});

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { test: { name: 'build', include: ['tests/build/**/*.test.ts'] } },
      dbProject('integration'),
      dbProject('compat'),
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
