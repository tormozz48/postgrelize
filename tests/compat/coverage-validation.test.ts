import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

type Define = (lib: Lib, sequelize: Sequelize) => ReturnType<Sequelize['define']>;

const messages = async (build: () => { validate: () => Promise<unknown> }, withArgs = true) => {
  try {
    await build().validate();
    return 'valid';
  } catch (error) {
    const items = (error as { errors: Record<string, unknown>[] }).errors;
    return items
      .map((item) => ({
        message: item['message'],
        type: item['type'],
        path: item['path'],
        value: item['value'],
        validatorKey: item['validatorKey'],
        validatorName: item['validatorName'],
        validatorArgs: withArgs ? item['validatorArgs'] : undefined,
      }))
      .toSorted((left, right) => String(left.path).localeCompare(String(right.path)));
  }
};

const run = (define: Define, scenario: (Model: ReturnType<Define>) => Promise<unknown>) =>
  expectSameResult('', async (lib, sequelize) => scenario(define(lib, sequelize)));

type Buildable = { build: (values: object) => { validate: () => Promise<unknown> } };

const defineBuiltin: Define = ({ DataTypes }, sequelize) =>
  sequelize.define('Thing', {
    email: { type: DataTypes.STRING, validate: { isEmail: { msg: 'bad email' } } },
    site: { type: DataTypes.STRING, validate: { isUrl: true } },
    pin: {
      type: DataTypes.STRING,
      validate: { isAlpha: { args: ['en-US'], msg: 'letters only' } },
    },
    code: { type: DataTypes.STRING, validate: { isAlphanumeric: true } },
    phone: { type: DataTypes.STRING, validate: { isMobilePhone: true } },
    addr: { type: DataTypes.STRING, validate: { isIP: true } },
    weight: { type: DataTypes.INTEGER, validate: { min: { args: [5], msg: 'too light' } } },
    kind: { type: DataTypes.STRING, validate: { isIn: { args: [['a', 'b']], msg: 'bad kind' } } },
    bio: { type: DataTypes.STRING, validate: { len: [2, 4], isLowercase: false } },
  });

const defineImmutable: Define = ({ DataTypes }, sequelize) =>
  sequelize.define('Thing', {
    code: { type: DataTypes.STRING, validate: { isImmutable: true } as never },
  });

const defineNotNull: Define = ({ DataTypes }, sequelize) =>
  sequelize.define('Thing', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notNull: { msg: 'name is required' } },
    },
    title: { type: DataTypes.STRING, allowNull: false },
    note: { type: DataTypes.TEXT },
  });

const defineCustom: Define = ({ DataTypes }, sequelize) =>
  sequelize.define('Thing', {
    sync: {
      type: DataTypes.STRING,
      validate: {
        failsWithError(value: string) {
          if (value === 'bad') {
            throw new Error('sync failure');
          }
        },
      },
    },
    callback: {
      type: DataTypes.STRING,
      validate: {
        viaCallback(value: string, done: (error?: Error) => void) {
          done(value === 'bad' ? new Error('callback failure') : undefined);
        },
      },
    },
    later: {
      type: DataTypes.STRING,
      validate: {
        async rejects(value: string) {
          if (value === 'bad') {
            throw 'string reason';
          }
        },
      },
    },
    empty: {
      type: DataTypes.STRING,
      validate: {
        emptyReason(value: string) {
          if (value === 'bad') {
            throw '';
          }
        },
      },
    },
  });

describe('compat: built-in attribute validators', () => {
  it('reports failures with the message, validator name and arguments', () =>
    run(defineBuiltin, (Thing) =>
      messages(() =>
        (Thing as unknown as Buildable).build({
          email: 'nope',
          site: 'not a url',
          pin: '123',
          code: '!!',
          phone: 'abc',
          addr: 'x',
          weight: 1,
          kind: 'z',
          bio: 'toolong',
        }),
      ),
    ));

  it('accepts valid values', () =>
    run(defineBuiltin, (Thing) =>
      messages(() =>
        (Thing as unknown as Buildable).build({
          email: 'a@b.io',
          site: 'https://example.com',
          pin: 'abc',
          code: 'a1',
          phone: '+15551234567',
          addr: '127.0.0.1',
          weight: 6,
          kind: 'a',
          bio: 'abc',
        }),
      ),
    ));

  it('rejects an unknown validator name like v6', () =>
    expectSameError('', async (lib, sequelize) => {
      const Thing = sequelize.define('Thing', {
        name: { type: lib.DataTypes.STRING, validate: { noSuchValidator: true } as never },
      });
      return (Thing as unknown as Buildable).build({ name: 'x' }).validate();
    }));
});

describe('compat: immutable attributes', () => {
  it('allows setting on create and rejects changes on later validation', () =>
    run(defineImmutable, async (Thing) => {
      const model = Thing as unknown as {
        build: (
          values: object,
          options?: object,
        ) => Record<string, unknown> & {
          validate: () => Promise<unknown>;
          set: (key: string, value: unknown) => void;
        };
      };
      const created = await messages(() => model.build({ code: 'one' }));
      const persisted = model.build({ code: 'one' }, { isNewRecord: false });
      persisted.set('code', 'two');
      return [created, await messages(() => persisted, false)];
    }));
});

describe('compat: not-null and string violations', () => {
  it('uses custom and default not-null messages', () =>
    run(defineNotNull, (Thing) =>
      messages(() => (Thing as unknown as Buildable).build({ name: null, title: null })),
    ));

  it('rejects arrays and objects for string attributes', () =>
    run(defineNotNull, (Thing) =>
      messages(() =>
        (Thing as unknown as Buildable).build({ name: 'x', title: ['a'], note: { a: 1 } }),
      ),
    ));
});

describe('compat: custom attribute validators', () => {
  it('reports failures of sync, callback and async validators', () =>
    run(defineCustom, (Thing) =>
      messages(() =>
        (Thing as unknown as Buildable).build({
          sync: 'bad',
          callback: 'bad',
          later: 'bad',
          empty: 'bad',
        }),
      ),
    ));

  it('passes when validators succeed', () =>
    run(defineCustom, (Thing) =>
      messages(() =>
        (Thing as unknown as Buildable).build({
          sync: 'ok',
          callback: 'ok',
          later: 'ok',
          empty: 'ok',
        }),
      ),
    ));
});
