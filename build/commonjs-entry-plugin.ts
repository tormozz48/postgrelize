import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

// Sequelize v6's `require('sequelize')` is the class with every export as a static (ADR-034).
const ENTRY = `'use strict';
const core = require('./index.core.cjs');
const Sequelize = core.Sequelize;
for (const key of Object.keys(core)) {
  if (key !== 'default') {
    Object.defineProperty(Sequelize, key, {
      value: core[key],
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}
Sequelize.Sequelize = Sequelize;
Sequelize.default = Sequelize;
module.exports = Sequelize;
`;

/**
 * Writes \`dist/index.cjs\`, the CommonJS entry of the package: the \`Sequelize\` class itself with
 * every named export copied onto it, next to the plain namespace bundle \`dist/index.core.cjs\`.
 */
export const commonJsEntryPlugin = (outDir = 'dist'): Plugin => ({
  name: 'postgrelize:commonjs-entry',
  apply: 'build',
  closeBundle() {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.cjs'), ENTRY);
  },
});
