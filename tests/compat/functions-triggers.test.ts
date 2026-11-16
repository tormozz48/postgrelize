import { describe, it } from 'vitest';
import { expectSameError, expectSameResult } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const select = async (sequelize: Sequelize, sql: string): Promise<unknown[]> =>
  (await sequelize.query(sql, { type: 'SELECT' })) as unknown[];

const SETUP =
  'CREATE TABLE posts (id serial PRIMARY KEY, title text, touched integer DEFAULT 0, log text)';

const catalog = (sequelize: Sequelize, name: string) =>
  select(
    sequelize,
    `SELECT p.proname, p.prosrc, p.provolatile, p.proisstrict, p.prosecdef, pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result, l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.proname = '${name}' AND p.pronamespace = current_schema()::regnamespace`,
  );

describe('createFunction / dropFunction / renameFunction match Sequelize v6', () => {
  it('creates a function with parameters, variables and options', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createFunction(
        'add_tax',
        [
          { type: 'integer', name: 'amount' },
          { type: 'integer', name: 'rate', direction: 'IN' },
        ],
        'integer',
        'plpgsql',
        'RETURN amount + amount * rate / base;',
        ['IMMUTABLE', 'STRICT', 'SECURITY DEFINER'],
        { variables: [{ type: 'integer', name: 'base', default: 100 }] },
      );
      const created = await catalog(sequelize, 'add_tax');
      const result = await select(sequelize, 'SELECT add_tax(200, 10) AS total');
      await queryInterface.createFunction(
        'add_tax',
        [
          { type: 'integer', name: 'amount' },
          { type: 'integer', name: 'rate' },
        ],
        'integer',
        'plpgsql',
        'RETURN 0;',
        [],
        { force: true },
      );
      const replaced = await select(sequelize, 'SELECT add_tax(1, 2) AS total');
      const params = [{ type: 'integer' }, { type: 'integer' }];
      await queryInterface.renameFunction('add_tax', params, 'add_vat');
      const renamed = await catalog(sequelize, 'add_vat');
      await queryInterface.dropFunction('add_vat', params);
      return { created, result, replaced, renamed, dropped: await catalog(sequelize, 'add_vat') };
    }));

  it('rejects missing parts and an existing function without force', () =>
    expectSameError(SETUP, async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createFunction('f', [], 'integer', 'plpgsql', 'RETURN 1;');
      await queryInterface.createFunction('f', [], 'integer', 'plpgsql', 'RETURN 1;');
    }));
});

describe('createTrigger / dropTrigger / renameTrigger match Sequelize v6', () => {
  it('fires a row trigger on insert and update', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createFunction(
        'bump',
        [],
        'trigger',
        'plpgsql',
        "NEW.touched := COALESCE(OLD.touched, 0) + 1; NEW.log := TG_OP || ':' || TG_WHEN; RETURN NEW;",
        ['VOLATILE'],
      );
      await queryInterface.createTrigger(
        'posts',
        'posts_bump',
        'before',
        ['insert', 'update'],
        'bump',
        [],
        ['FOR EACH ROW'],
      );
      await sequelize.query("INSERT INTO posts (title) VALUES ('a')");
      await sequelize.query("UPDATE posts SET title = 'b'");
      const rows = await select(sequelize, 'SELECT title, touched, log FROM posts');
      const triggers = () =>
        select(
          sequelize,
          "SELECT tgname, tgtype, tgenabled FROM pg_trigger WHERE tgrelid = 'posts'::regclass AND NOT tgisinternal",
        );
      const created = await triggers();
      await queryInterface.renameTrigger('posts', 'posts_bump', 'posts_bump2');
      const renamed = await triggers();
      await queryInterface.dropTrigger('posts', 'posts_bump2');
      return { rows, created, renamed, dropped: await triggers() };
    }));

  it('rejects an unknown event', () =>
    expectSameError(SETUP, async (_lib, sequelize) => {
      await sequelize
        .getQueryInterface()
        .createTrigger('posts', 't', 'after', ['bogus' as never], 'f', [], []);
    }));
});
