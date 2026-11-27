import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const integration = fileURLToPath(new URL('../../integration/', import.meta.url));

describe('integration files that create extensions', () => {
  it('use their own database', () => {
    const shared = readdirSync(integration, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.test.ts'))
      .filter((file) => {
        const source = readFileSync(`${integration}${file}`, 'utf8');
        return (
          /CREATE EXTENSION|createExtension\(/i.test(source) &&
          !source.includes('registerFileDatabase();')
        );
      });
    expect(shared).toEqual([]);
  });
});
