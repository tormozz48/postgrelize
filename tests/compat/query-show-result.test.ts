import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: raw SHOW statements', () => {
  it('resolve to the rows alone', () =>
    expectSameResult('', async (_lib, sequelize) => [
      await sequelize.query('SHOW standard_conforming_strings'),
      await sequelize.query('  show standard_conforming_strings', { type: 'SELECT' as never }),
      await sequelize.query('SHOW standard_conforming_strings', { plain: true }),
    ]));
});
