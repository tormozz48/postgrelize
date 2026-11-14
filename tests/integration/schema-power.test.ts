import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

describe('identity and generated columns', () => {
  it('creates identity and stored generated columns and never writes generated values', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const Line = sequelize.define('Line', {
        id: { type: DataTypes.BIGINT, primaryKey: true, identity: 'always' },
        price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        qty: { type: DataTypes.INTEGER, allowNull: false },
        total: { type: DataTypes.DECIMAL(12, 2), generated: { as: literal('"price" * "qty"') } },
        span: DataTypes.INTERVAL,
      });
      await sequelize.sync();
      const described = await sequelize.getQueryInterface().describeTable('Lines');
      expect(described['id']?.defaultValue).toBeNull();
      const line = await Line.create({ price: '2.50', qty: 4, span: '1 day 02:00:00' });
      expect([line.get('id'), line.get('total'), line.get('span')]).toEqual([
        '1',
        '10.00',
        '1 day 02:00:00',
      ]);
      line.set('qty', 5);
      await line.save();
      expect(line.get('total')).toBe('12.50');
      await Line.bulkCreate([{ price: '1.00', qty: 1 }]);
      await expect(Line.create({ id: '99', price: '1.00', qty: 1 })).rejects.toThrow(
        /cannot insert a non-DEFAULT value/,
      );
      const forced = await Line.create(
        { id: '99', price: '1.00', qty: 2 },
        { overriding: 'system' },
      );
      expect([forced.get('id'), forced.get('total')]).toEqual(['99', '2.00']);
      const [inserted] = await Line.insert(
        { id: '100', price: '3.00', qty: 1 },
        { overriding: 'system' },
      );
      expect(inserted?.get('id')).toBe('100');
    }));
});

describe('enum values on sync alter', () => {
  it('adds new enum values to the existing type', () =>
    withSchema(async ({ schema }) => {
      const first = connect(schema);
      first.define('Ticket', { state: DataTypes.ENUM('open', 'closed') });
      await first.sync();
      const second = connect(schema);
      const Ticket = second.define('Ticket', {
        state: DataTypes.ENUM('open', 'closed', 'archived'),
      });
      await second.sync({ alter: true });
      const described = await second.getQueryInterface().describeTable('Tickets');
      expect(described['state']?.special).toEqual(['open', 'closed', 'archived']);
      await expect(Ticket.create({ state: 'archived' })).resolves.toBeDefined();
    }));
});
