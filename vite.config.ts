import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' with { type: 'json' };

const external = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
];

export default defineConfig({
  build: {
    target: 'node20',
    sourcemap: true,
    minify: false,
    lib: {
      entry: { index: 'src/index.ts' },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rolldownOptions: {
      external,
    },
  },
  plugins: [dts({ tsconfigPath: './tsconfig.build.json' })],
});
