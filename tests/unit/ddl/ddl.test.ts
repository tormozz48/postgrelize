import { describe, expect, it } from 'vitest';
import { DataTypes, toDataType } from '../../../src/data-types/data-types.ts';
import {
  addConstraintSql,
  createIndexSql,
  createTableSql,
  indexName,
  type ColumnDefinition,
} from '../../../src/ddl/ddl.ts';
import { escapeLiteral, inlineValues } from '../../../src/ddl/literals.ts';
import { Op } from '../../../src/expressions/op.ts';

const column = (
  overrides: Partial<ColumnDefinition> & Pick<ColumnDefinition, 'field'>,
): ColumnDefinition => ({
  name: overrides.field,
  type: toDataType(DataTypes.STRING),
  allowNull: true,
  primaryKey: false,
  autoIncrement: false,
  defaultValue: undefined,
  unique: undefined,
  comment: undefined,
  references: undefined,
  onDelete: undefined,
  onUpdate: undefined,
  ...overrides,
});

describe('escapeLiteral', () => {
  it('escapes strings, backslashes and special values', () => {
    expect(escapeLiteral("it's")).toBe("'it''s'");
    expect(escapeLiteral('a\\b')).toBe("E'a\\\\b'");
    expect(escapeLiteral("x'); DROP TABLE t; --")).toBe("'x''); DROP TABLE t; --'");
    expect(escapeLiteral(null)).toBe('NULL');
    expect(escapeLiteral(true)).toBe('true');
    expect(escapeLiteral(1.5)).toBe('1.5');
    expect(escapeLiteral([])).toBe("'{}'");
    expect(escapeLiteral(['a', 1])).toBe("ARRAY['a', 1]");
    expect(escapeLiteral({ a: "'" })).toBe(`'{"a":"''"}'`);
    expect(escapeLiteral(Buffer.from('hi'))).toBe("'\\x6869'::bytea");
    expect(() => escapeLiteral('a\0b')).toThrow(/NUL/);
    expect(() => escapeLiteral(Number.NaN)).toThrow(/non-finite/);
  });

  it('inlines placeholders outside quoted text only', () => {
    expect(inlineValues({ text: `"$1" = $1 AND '$2' = $2`, values: ['a', 2] })).toBe(
      `"$1" = 'a' AND '$2' = 2`,
    );
  });
});

describe('DDL builders', () => {
  it('creates tables with enums, keys, defaults, references and comments', () => {
    expect(
      createTableSql({ tableName: 'Users', schema: 'app' }, [
        column({
          field: 'id',
          type: toDataType(DataTypes.INTEGER),
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        }),
        column({ field: 'email', allowNull: false, unique: { nullsNotDistinct: true } }),
        column({ field: 'status', type: DataTypes.ENUM('a', "b'c"), defaultValue: 'a' }),
        column({ field: 'meta', type: toDataType(DataTypes.JSONB), defaultValue: {} }),
        column({ field: 'org', unique: 'org_slug' }),
        column({ field: 'slug', unique: 'org_slug', comment: 'url part' }),
        column({
          field: 'teamId',
          type: toDataType(DataTypes.INTEGER),
          references: { model: 'Teams', key: 'id' },
          onDelete: 'set null',
          onUpdate: 'CASCADE',
        }),
      ]),
    ).toEqual([
      `DO 'BEGIN CREATE TYPE "app"."enum_Users_status" AS ENUM(''a'', ''b''''c''); EXCEPTION WHEN duplicate_object THEN null; END'`,
      'CREATE TABLE IF NOT EXISTS "app"."Users" ("id" SERIAL, "email" VARCHAR(255) NOT NULL UNIQUE NULLS NOT DISTINCT, "status" "app"."enum_Users_status" DEFAULT \'a\', "meta" JSONB DEFAULT \'{}\', "org" VARCHAR(255), "slug" VARCHAR(255), "teamId" INTEGER REFERENCES "Teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "org_slug" UNIQUE ("org", "slug"), PRIMARY KEY ("id"))',
      `COMMENT ON COLUMN "app"."Users"."slug" IS 'url part'`,
    ]);
  });

  it('names and creates indexes like v6, with PostgreSQL extensions', () => {
    expect(indexName('Users', ['score'])).toBe('users_score');
    expect(
      createIndexSql('Users', {
        fields: ['big', { name: 'email', order: 'DESC', collate: 'C' }],
        unique: true,
        nullsNotDistinct: true,
        where: { big: { [Op.gt]: 1 }, email: "x'y" },
        include: ['name'],
        ifNotExists: true,
      }),
    ).toBe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_big_email" ON "Users" ("big", "email" COLLATE "C" DESC) INCLUDE ("name") NULLS NOT DISTINCT WHERE ("big" > 1 AND "email" = 'x''y')`,
    );
    expect(() => createIndexSql('Users', { fields: ['a'], using: 'gin; DROP' })).toThrow(
      /Invalid index method/,
    );
  });

  it('builds constraints and validates referential actions', () => {
    expect(
      addConstraintSql('Users', {
        type: 'check',
        fields: ['big'],
        where: { big: { [Op.gt]: 0 } },
        name: 'big_positive',
      }),
    ).toBe('ALTER TABLE "Users" ADD CONSTRAINT "big_positive" CHECK ("big" > 0)');
    expect(() =>
      addConstraintSql('Users', {
        type: 'foreign key',
        fields: ['a'],
        references: { table: 'T', field: 'id' },
        onDelete: 'DROP DATABASE',
      }),
    ).toThrow(/Invalid referential action/);
  });
});
