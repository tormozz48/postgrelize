import { afterEach, expect, it } from 'vitest';
import { DataTypes, literal, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

// v6 types declare `instance.update(key, value)`; v6 itself only handles the object form at run time.
it('instance.update(key, value) sets one attribute, expressions included, and saves', () =>
  withSchema(async ({ schema }) => {
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    const Note = sequelize.define('Note', { title: DataTypes.STRING, size: DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    const note = await Note.create({ title: 'a', size: 2 });
    await note.update('title', 'b');
    await note.update('size', literal('size * 5'));
    await note.reload();
    expect([note.get('title'), note.get('size')]).toEqual(['b', 10]);
  }));
