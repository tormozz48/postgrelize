import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize, col } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

type Row = Record<string, unknown>;

const setup = async (schema: string) => {
  const logged: string[] = [];
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: (sql) => logged.push(sql),
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Task = sequelize.define(
    'Task',
    { title: DataTypes.TEXT, done: { type: DataTypes.BOOLEAN, defaultValue: false } },
    { timestamps: false },
  );
  const Node = sequelize.define(
    'Node',
    { name: DataTypes.TEXT, parentId: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await Task.bulkCreate([
    { title: 'a', done: true },
    { title: 'b', done: false },
    { title: 'c', done: true },
  ]);
  return { sequelize, Task, Node, logged };
};

const titles = (rows: readonly { get(key: string): unknown }[]): unknown[] =>
  rows.map((row) => row.get('title'));

describe('data-modifying CTEs', () => {
  it('deletes rows and reads the deleted rows through source', () =>
    withSchema(async ({ schema }) => {
      const { Task, logged } = await setup(schema);
      const removed = await Task.findAll({
        with: { gone: Task.deleteStatement({ where: { done: true }, returning: true }) },
        source: 'gone',
        order: [['id', 'ASC']],
      });
      expect(titles(removed)).toEqual(['a', 'c']);
      expect(removed[0]).toBeInstanceOf(Task);
      expect(logged.at(-1)).toContain(
        'WITH "gone" AS (DELETE FROM "Tasks" WHERE "done" = $1 RETURNING',
      );
      expect(titles(await Task.findAll())).toEqual(['b']);
    }));

  it('updates rows and counts the result', () =>
    withSchema(async ({ schema }) => {
      const { Task } = await setup(schema);
      const options = {
        with: {
          bumped: Task.updateStatement({ done: true }, { where: { title: 'b' }, returning: true }),
        },
        source: 'bumped',
      };
      expect(await Task.count(options)).toBe(1);
      expect(await Task.count({ where: { done: true } })).toBe(3);
    }));

  it('inserts rows with defaults and returns them', () =>
    withSchema(async ({ schema }) => {
      const { Task } = await setup(schema);
      const added = await Task.findAll({
        with: {
          added: Task.insertStatement([{ title: 'd' }, { title: 'e' }], { returning: true }),
        },
        source: 'added',
        order: [['title', 'ASC']],
      });
      expect(added.map((row) => [row.get('title'), row.get('done')])).toEqual([
        ['d', false],
        ['e', false],
      ]);
      expect(await Task.count()).toBe(5);
    }));

  it('runs without returning and keeps the main query independent', () =>
    withSchema(async ({ schema }) => {
      const { Task } = await setup(schema);
      const rows = await Task.findAll({
        with: { purge: Task.deleteStatement({ where: { title: 'a' } }) },
        where: { title: 'b' },
      });
      expect(titles(rows)).toEqual(['b']);
      expect(await Task.count()).toBe(2);
    }));

  it('rejects empty inserts and recursive statements', () =>
    withSchema(async ({ schema }) => {
      const { Task } = await setup(schema);
      expect(() => Task.insertStatement([])).toThrow('at least one row');
      const statement = Task.deleteStatement({ returning: true });
      await expect(
        Task.findAll({
          with: { x: { query: statement, recursive: Task.subquery() } },
          source: 'x',
        }),
      ).rejects.toThrow('cannot be recursive');
    }));
});

const tree = (Node: Awaited<ReturnType<typeof setup>>['Node']) => ({
  query: Node.subquery({ where: { name: 'root' } }),
  recursive: Node.subquery({ where: { parentId: col('tree.id') }, from: { tree: 'tree' } }),
});

describe('CTE SEARCH and CYCLE', () => {
  it('orders a tree depth first and breadth first', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      await Node.bulkCreate([
        { name: 'root', parentId: null },
        { name: 'a', parentId: 1 },
        { name: 'b', parentId: 1 },
        { name: 'a1', parentId: 2 },
      ]);
      const walk = async (mode: 'depth' | 'breadth') =>
        (
          (await Node.findAll({
            with: { tree: { ...tree(Node), search: { by: ['id'], mode, set: 'ord' } } },
            source: 'tree',
            attributes: ['name'],
            order: [[col('ord'), 'ASC']],
            raw: true,
          })) as unknown as Row[]
        ).map((row) => row['name']);
      expect(await walk('depth')).toEqual(['root', 'a', 'a1', 'b']);
      expect(await walk('breadth')).toEqual(['root', 'a', 'b', 'a1']);
    }));

  it('stops at a cycle and marks the row', () =>
    withSchema(async ({ schema }) => {
      const { Node, logged } = await setup(schema);
      await Node.bulkCreate([
        { name: 'root', parentId: 2 },
        { name: 'b', parentId: 1 },
      ]);
      const rows = (await Node.findAll({
        with: {
          tree: { ...tree(Node), cycle: { columns: ['id'], set: 'looped', using: 'trail' } },
        },
        source: 'tree',
        attributes: ['name', [col('looped'), 'looped']],
        raw: true,
      })) as unknown as Row[];
      expect(rows.map((row) => [row['name'], row['looped']])).toEqual([
        ['root', false],
        ['b', false],
        ['root', true],
      ]);
      expect(logged.at(-1)).toContain('CYCLE "id" SET "looped" USING "trail"');
    }));

  it('validates the options', () =>
    withSchema(async ({ schema }) => {
      const { Node } = await setup(schema);
      const run = (definition: object) =>
        Node.findAll({ with: { t: definition as never }, source: 't' });
      await expect(
        run({ query: Node.subquery(), search: { by: ['id'], set: 's' } }),
      ).rejects.toThrow('need a recursive part');
      await expect(
        run({ ...tree(Node), search: { by: ['id'], set: 's', mode: 'sideways' } }),
      ).rejects.toThrow('Invalid CTE search mode');
    }));
});
