import { describe, expect, it } from 'vitest';
import { expectSameResult, libraries } from '../support/compat.ts';

describe('compat: inputs of sync and addIndex', () => {
  it('accepts null addIndex options', () =>
    expectSameResult('CREATE TABLE t (a int, b int)', async (_lib, sequelize) => {
      await sequelize.getQueryInterface().addIndex('t', ['a', 'b'], null as never);
      const [indexes] = await sequelize.query(
        'SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()',
      );
      return indexes.map((index) => (index as { indexdef: string }).indexdef.split(' USING ')[1]);
    }));

  it('rejects a sync without models when the database is unreachable', async () => {
    for (const lib of Object.values(libraries)) {
      const Sequelize = (
        lib as unknown as {
          Sequelize: new (
            uri: string,
            options: object,
          ) => { sync(): Promise<unknown>; close(): Promise<void> };
        }
      ).Sequelize;
      const sequelize = new Sequelize('postgres://user:pass@127.0.0.1:1/db', { logging: false });
      await expect(sequelize.sync()).rejects.toMatchObject({
        name: 'SequelizeConnectionRefusedError',
      });
      await sequelize.close();
    }
  });
});
