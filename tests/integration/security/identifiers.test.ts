import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, col, fn } from '../../../src/index.ts';
import {
  PAYLOADS,
  identifier,
  propertyParameters,
  settle,
  withCanary,
} from '../../support/injection.ts';

// Keys starting with `$` or containing `.` / `::` are where-syntax (nested paths, casts) in v6.
const plainName = (): fc.Arbitrary<string> =>
  identifier().filter(
    (name) => !name.startsWith('$') && !name.includes('.') && !name.includes('::'),
  );

const columnsOf = async (client: { query: Function }, schema: string, table: string) =>
  (
    (await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, table],
    )) as { rows: { column_name: string }[] }
  ).rows.map((row) => row.column_name);

describe('identifiers are quoted wherever names reach SQL', () => {
  it('creates and queries tables and columns with arbitrary names', () =>
    withCanary(async ({ sequelize, client, schema }) => {
      await fc.assert(
        fc.asyncProperty(
          identifier(),
          plainName(),
          identifier(),
          plainName(),
          async (table, attribute, field, alias) => {
            fc.pre(attribute !== 'id' && field !== 'id');
            const Thing = sequelize.define(
              'Thing',
              { [attribute]: { type: DataTypes.TEXT, field } },
              { tableName: table, timestamps: false },
            );
            await Thing.sync({ force: true });
            expect(await columnsOf(client, schema, table)).toEqual(['id', field]);
            await Thing.create({ [attribute]: 'v' });
            const rows = await Thing.findAll({
              attributes: [attribute, [col(field), alias], [fn('upper', col(field)), 'up']],
              where: { [attribute]: 'v' },
              order: [[attribute, 'DESC']],
              group: [field],
              raw: true,
            });
            expect(rows).toEqual([{ [attribute]: 'v', [alias]: 'v', up: 'V' }]);
            await Thing.update({ [attribute]: 'w' }, { where: { [attribute]: 'v' } });
            expect(await Thing.count({ where: { [attribute]: 'w' } })).toBe(1);
            await Thing.drop();
          },
        ),
        { ...propertyParameters(), numRuns: 30 },
      );
    }));

  it('creates schemas, enum types, indexes and comments with arbitrary names', () =>
    withCanary(async ({ sequelize, client }) => {
      await fc.assert(
        fc.asyncProperty(
          identifier(),
          identifier(),
          plainName(),
          async (schemaName, label, name) => {
            fc.pre(name !== 'id');
            await sequelize.createSchema(schemaName);
            const Tagged = sequelize.define(
              'Tagged',
              {
                [name]: {
                  type: DataTypes.ENUM(label, 'other'),
                  comment: label,
                  defaultValue: label,
                },
              },
              {
                schema: schemaName,
                tableName: name,
                timestamps: false,
                indexes: [{ name: `${name.slice(0, 20)} idx`, fields: [name] }],
              },
            );
            await Tagged.sync();
            await Tagged.create({});
            expect((await Tagged.findAll()).map((row) => row.get(name))).toEqual([label]);
            const comment = await client.query(
              'SELECT col_description(c.oid, 2) AS comment FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2',
              [schemaName, name],
            );
            expect(comment.rows[0]?.comment).toBe(label);
            await sequelize.dropSchema(schemaName);
          },
        ),
        { ...propertyParameters(), numRuns: 30 },
      );
    }));

  it('rejects or quotes payloads used as where keys, order, group and attribute aliases', () =>
    withCanary(async ({ sequelize }) => {
      const Item = sequelize.define('Item', { code: DataTypes.TEXT }, { timestamps: false });
      await Item.sync();
      await Item.create({ code: 'x' });
      for (const payload of PAYLOADS) {
        const attempts = [
          () => Item.findAll({ where: { [payload]: 1 } }),
          () => Item.findAll({ order: [[payload, 'ASC']] }),
          () => Item.findAll({ order: [[payload, 'ASC']], group: [payload] }),
          () => Item.findAll({ attributes: [['code', payload]], raw: true }),
          () => Item.findAll({ attributes: [payload] }),
          () =>
            sequelize.query(`SELECT 1 AS x`, {
              type: QueryTypes.SELECT,
              replacements: { [payload]: 1 },
            }),
        ];
        for (const attempt of attempts) {
          const result = await settle(attempt());
          // A payload that escaped its quoting shows up as a syntax error (42601); a missing column is fine.
          const code = (result as { original?: { code?: string } }).original?.code;
          expect(code, `${payload}: ${String(result)}`).not.toBe('42601');
        }
      }
    }));
});
