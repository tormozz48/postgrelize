import { describe, expect, it } from 'vitest';
import { DataTypes, Deferrable, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// v6 does this too, but only in `public`: its foreign key lookup ignores `search_path`
describe('sync({ alter }) of a deferrable foreign key', () => {
  it('re-creates the foreign key when the deferrable mode changed', () =>
    withSchema(async ({ schema }) => {
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      try {
        const Parent = sequelize.define('Parent', {});
        const Child = sequelize.define('Child', {
          ParentId: {
            type: DataTypes.INTEGER,
            references: { model: 'Parents', deferrable: Deferrable.INITIALLY_IMMEDIATE },
          } as never,
        });
        Child.belongsTo(Parent);
        const modes = async () =>
          (await sequelize.queryInterface.getForeignKeyReferencesForTable('Children')).map(
            (key) => (key.deferrable as unknown as { sql: string }).sql,
          );
        await sequelize.sync();
        const before = await modes();
        const attribute = (
          Child as unknown as { rawAttributes: Record<string, { references: object }> }
        ).rawAttributes['ParentId']!;
        Object.assign(attribute.references, { deferrable: Deferrable.INITIALLY_DEFERRED });
        await sequelize.sync({ alter: true });
        expect([before, await modes()]).toEqual([
          ['DEFERRABLE INITIALLY IMMEDIATE'],
          ['DEFERRABLE INITIALLY DEFERRED'],
        ]);
      } finally {
        await sequelize.close();
      }
    }));
});
