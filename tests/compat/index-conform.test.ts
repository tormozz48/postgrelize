import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: index type unique and JSONB index: true', () => {
  it('creates unique and gin indexes at sync', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, JSONB } = lib.DataTypes;
      sequelize.define(
        'event',
        { name: STRING, code: STRING, data: { type: JSONB, index: true } as never },
        {
          indexes: [
            { type: 'unique', fields: ['name'] } as never,
            { type: 'UNIQUE', fields: ['code'] } as never,
          ],
        },
      );
      await sequelize.sync({ force: true });
      return sequelize.query(
        `SELECT indexname, regexp_replace(indexdef, ' ON [^ ]+ ', ' ON t ') AS def
         FROM pg_indexes WHERE schemaname = current_schema() ORDER BY 1`,
        { type: 'SELECT' as never },
      );
    }));
});
