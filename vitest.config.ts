import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { decoratorsPlugin } from './build/decorators-plugin.ts';

const dbProject = (name: string) => ({
  extends: true,
  test: {
    name,
    include: [`tests/${name}/**/*.test.ts`],
    globalSetup: ['tests/support/global-setup-db.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

export default defineConfig({
  plugins: [decoratorsPlugin()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'build', include: ['tests/build/**/*.test.ts'] } },
      dbProject('integration'),
      {
        extends: true,
        test: {
          ...dbProject('compat').test,
          setupFiles: ['tests/support/file-database.ts'],
        },
      },
      {
        ...dbProject('docs'),
        resolve: {
          alias: [
            {
              find: /^postgrelize$/,
              replacement: fileURLToPath(new URL('src/index.ts', import.meta.url)),
            },
          ],
        },
      },
      {
        extends: true,
        test: { name: 'bench', include: ['bench/run.test.ts'], testTimeout: 900_000 },
      },
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
