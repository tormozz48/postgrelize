import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: rawErrors query option', () => {
  it('rejects with the driver error', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const outcome = async (rawErrors: boolean) => {
        const error = (await sequelize
          .query('SELECT 1 FROM missing_table', { rawErrors } as never)
          .catch((caught: unknown) => caught)) as Error & { code?: string };
        return [error.name, error.code ?? null];
      };
      return [await outcome(false), await outcome(true)];
    }));
});
