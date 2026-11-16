import { describe, expect, it } from 'vitest';
import { AbstractDataType } from '../../../src/data-types/abstract-data-type.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';
import { DdlGenerator, type ColumnDefinition } from '../../../src/ddl/ddl-generator.ts';
import { Deferrable } from '../../../src/ddl/ddl-types.ts';
import { SqlLiteral } from '../../../src/ddl/sql-literal.ts';

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

const typed = (type: unknown, extra: Partial<ColumnDefinition> = {}) =>
  ddl.columnType(
    'T',
    column({
      field: 'id',
      type: AbstractDataType.from(type as never),
      autoIncrement: true,
      ...extra,
    }),
  );

const refs = (references: unknown) =>
  ddl.columnSql('T', column({ field: 'r', references: references as never, onDelete: 'cascade' }));

describe('constraint DDL', () => {
  it('names constraints like v6 when no name is given', () => {
    expect(ddl.addConstraintSql('Users', { type: 'unique', fields: ['a', 'b'] })).toBe(
      'ALTER TABLE "Users" ADD CONSTRAINT "Users_a_b_uk" UNIQUE ("a", "b")',
    );
    expect(ddl.addConstraintSql('Users', { type: 'primary key', fields: ['id'] })).toBe(
      'ALTER TABLE "Users" ADD CONSTRAINT "Users_id_pk" PRIMARY KEY ("id")',
    );
    expect(
      ddl.addConstraintSql(
        { tableName: 'Posts', schema: 's' },
        {
          type: 'foreign key',
          fields: ['userId'],
          references: { table: 'Users', field: 'id' },
          onDelete: 'cascade',
          onUpdate: 'set null',
          deferrable: Deferrable.INITIALLY_DEFERRED,
        },
      ),
    ).toBe(
      'ALTER TABLE "s"."Posts" ADD CONSTRAINT "Posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE SET NULL DEFERRABLE INITIALLY DEFERRED',
    );
  });

  it('supports NULLS NOT DISTINCT unique constraints and the default schema', () => {
    expect(
      ddl.addConstraintSql(
        'Users',
        { type: 'UNIQUE', fields: ['email'], nullsNotDistinct: true, name: 'u_email' },
        'app',
      ),
    ).toBe(
      'ALTER TABLE "app"."Users" ADD CONSTRAINT "u_email" UNIQUE NULLS NOT DISTINCT ("email")',
    );
  });

  it('rejects unknown types and foreign keys without references', () => {
    expect(() => ddl.addConstraintSql('Users', { type: 'bogus' as never, fields: ['a'] })).toThrow(
      /Constraint type must be specified through options.type/,
    );
    expect(() => ddl.addConstraintSql('Users', { type: 'foreign key', fields: ['a'] })).toThrow(
      'Foreign key constraint requires references',
    );
  });

  it('rejects a deferrable value that is not a Deferrable constant', () => {
    expect(() =>
      ddl.addConstraintSql('Users', {
        type: 'foreign key',
        fields: ['a'],
        references: { table: 'T', field: 'id' },
        deferrable: { sql: 'DEFERRABLE; DROP TABLE x' },
      }),
    ).toThrow(/Invalid deferrable/);
    expect(DdlGenerator.deferrableSql(Deferrable.NOT)).toBe('NOT DEFERRABLE');
  });
});

describe('index DDL', () => {
  it('requires at least one field', () => {
    expect(() => ddl.createIndexSql('Users', {})).toThrow('Index requires at least one field');
    expect(() => ddl.createIndexSql('Users', { fields: [] })).toThrow(
      'Index requires at least one field',
    );
  });

  it('renders field options, INCLUDE, NULLS NOT DISTINCT and partial predicates', () => {
    expect(
      ddl.createIndexSql('Users', {
        name: 'users_idx',
        unique: true,
        concurrently: true,
        ifNotExists: true,
        using: 'btree',
        nullsNotDistinct: true,
        fields: [
          { name: 'email', collate: 'C', order: 'DESC' },
          { name: 'name', order: 'ASC' },
        ],
        include: ['id'],
        where: { id: 1 },
      }),
    ).toBe(
      'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "users_idx" ON "Users" USING btree ("email" COLLATE "C" DESC, "name" ASC) INCLUDE ("id") NULLS NOT DISTINCT WHERE "id" = 1',
    );
  });
});

describe('column DDL', () => {
  it('uses serial types by integer width and identity columns', () => {
    expect(typed(DataTypes.BIGINT)).toBe('BIGSERIAL');
    expect(typed(DataTypes.SMALLINT)).toBe('SMALLSERIAL');
    expect(typed(DataTypes.INTEGER)).toBe('SERIAL');
    expect(typed(DataTypes.INTEGER, { identity: 'always', autoIncrement: false })).toBe(
      'INTEGER GENERATED ALWAYS AS IDENTITY',
    );
    expect(typed(DataTypes.INTEGER, { identity: 'byDefault', autoIncrement: false })).toBe(
      'INTEGER GENERATED BY DEFAULT AS IDENTITY',
    );
  });

  it('renders DEFAULT only for server-side defaults', () => {
    expect(ddl.defaultSql(column({ field: 'a', defaultValue: 'x' }))).toBe("'x'");
    expect(ddl.defaultSql(column({ field: 'a' }))).toBeUndefined();
  });

  it('renders references given as a table name or a model-like object', () => {
    expect(refs('Users')).toBe('"r" VARCHAR(255) REFERENCES "Users" ("id") ON DELETE CASCADE');
    expect(refs({ model: 'Users', key: 'uid' })).toBe(
      '"r" VARCHAR(255) REFERENCES "Users" ("uid") ON DELETE CASCADE',
    );
    expect(refs({ model: { tableName: 'Users', schema: 's' }, deferrable: Deferrable.NOT })).toBe(
      '"r" VARCHAR(255) REFERENCES "s"."Users" ("id") ON DELETE CASCADE NOT DEFERRABLE',
    );
  });
});

describe('SQL literal escaping', () => {
  it('renders bigint and Date values', () => {
    expect(sqlLiteral.escape(9007199254740993n)).toBe('9007199254740993');
    expect(sqlLiteral.escape(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      "'2026-01-02T03:04:05.000Z'",
    );
  });
});
