import { expect, it } from 'vitest';

it('runs the ORM benchmark', async () => {
  await expect(import('./orm.bench.ts')).resolves.toBeDefined();
});
