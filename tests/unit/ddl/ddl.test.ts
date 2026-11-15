import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';
import { DdlGenerator, type ColumnDefinition } from '../../../src/ddl/ddl-generator.ts';
import { SqlLiteral } from '../../../src/ddl/sql-literal.ts';
import { Op } from '../../../src/expressions/op.ts';

const ddl = new DdlGenerator();

const sqlLiteral = new SqlLiteral();

const column = (
  overrides: Partial<ColumnDefinition> & Pick<ColumnDefinition, 'field'>,
): ColumnDefinition => ({
  name: overrides.field,
  type: AbstractDataType.from(DataTypes.STRING),
  allowNull: true,
  primaryKey: false,
  autoIncrement: false,
  defaultValue: undefined,
  unique: undefined,
  comment: undefined,
  references: undefined,
  onDelete: undefined,
  onUpdate: undefined,
  identity: undefined,
  generated: undefined,
  ...overrides,
});

describe('escapeLiteral', () => {
  it('escapes strings, backslashes and special values', () => {
    expect(sqlLiteral.escape("it's")).toBe("'it''s'");
    expect(sqlLiteral.escape('a\\b')).toBe("E'a\\\\b'");
    expect(sqlLiteral.escape("x'); DROP TABLE t; --")).toBe("'x''); DROP TABLE t; --'");
    expect(sqlLiteral.escape(null)).toBe('NULL');
    expect(sqlLiteral.escape(true)).toBe('true');
    expect(sqlLiteral.escape(1.5)).toBe('1.5');
    expect(sqlLiteral.escape([])).toBe("'{}'");
    expect(sqlLiteral.escape(['a', 1])).toBe("ARRAY['a', 1]");
    expect(sqlLiteral.escape({ a: "'" })).toBe(`'{"a":"''"}'`);
    expect(sqlLiteral.escape(Buffer.from('hi'))).toBe("'\\x6869'::bytea");
    expect(() => sqlLiteral.escape('a\0b')).toThrow(/NUL/);
    expect(() => sqlLiteral.escape(Number.NaN)).toThrow(/non-finite/);
  });

  it('inlines placeholders outside quoted text only', () => {
    expect(sqlLiteral.inlineValues({ text: `"$1" = $1 AND '$2' = $2`, values: ['a', 2] })).toBe(
      `"$1" = 'a' AND '$2' = 2`,
    );
  });
});

describe('DDL builders', () => {
  it('creates tables with enums, keys, defaults, references and comments', () => {
    expect(
      ddl.createTableSql({ tableName: 'Users', schema: 'app' }, [
        column({
          field: 'id',
          type: AbstractDataType.from(DataTypes.INTEGER),
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        }),
        column({ field: 'email', allowNull: false, unique: { nullsNotDistinct: true } }),
        column({ field: 'status', type: DataTypes.ENUM('a', "b'c"), defaultValue: 'a' }),
        column({ field: 'meta', type: AbstractDataType.from(DataTypes.JSONB), defaultValue: {} }),
        column({ field: 'org', unique: 'org_slug' }),
        column({ field: 'slug', unique: 'org_slug', comment: 'url part' }),
        column({
          field: 'teamId',
          type: AbstractDataType.from(DataTypes.INTEGER),
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
    expect(ddl.indexName('Users', ['score'])).toBe('users_score');
    expect(
      ddl.createIndexSql('Users', {
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
    expect(() => ddl.createIndexSql('Users', { fields: ['a'], using: 'gin; DROP' })).toThrow(
      /Invalid index method/,
    );
  });

  it('builds constraints and validates referential actions', () => {
    expect(
      ddl.addConstraintSql('Users', {
        type: 'check',
        fields: ['big'],
        where: { big: { [Op.gt]: 0 } },
        name: 'big_positive',
      }),
    ).toBe('ALTER TABLE "Users" ADD CONSTRAINT "big_positive" CHECK ("big" > 0)');
    expect(() =>
      ddl.addConstraintSql('Users', {
        type: 'foreign key',
        fields: ['a'],
        references: { table: 'T', field: 'id' },
        onDelete: 'DROP DATABASE',
      }),
    ).toThrow(/Invalid referential action/);
  });
});
