import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, InstanceError, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = <T>(
  run: (models: {
    sequelize: Sequelize;
    Author: ReturnType<Sequelize['define']>;
    Book: ReturnType<Sequelize['define']>;
  }) => Promise<T>,
): Promise<T> =>
  withSchema(async ({ schema }) => {
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    const Author = sequelize.define(
      'Author',
      { name: DataTypes.TEXT, bio: DataTypes.TEXT },
      { paranoid: true, timestamps: true },
    );
    const Book = sequelize.define('Book', { title: DataTypes.TEXT }, { timestamps: false });
    Author.hasMany(Book);
    Book.belongsTo(Author);
    await sequelize.sync();
    return run({ sequelize, Author, Book });
  });

describe('Model#reload options', () => {
  it('loads associations with include', () =>
    setup(async ({ Author, Book }) => {
      const author = await Author.create({ name: 'Ann', bio: 'x' });
      await Book.create({ title: 'T', AuthorId: author.get('id') });
      await author.reload({ include: [Book] });
      const books = author.get('Books') as { get: (key: string) => unknown }[];
      expect(books.map((book) => book.get('title'))).toEqual(['T']);
    }));

  it('reads only the requested attributes and keeps the others', () =>
    setup(async ({ Author }) => {
      const author = await Author.create({ name: 'Ann', bio: 'old' });
      await Author.update({ name: 'Bea', bio: 'new' }, { where: { id: author.get('id') } });
      await author.reload({ attributes: ['id', 'name'] });
      expect([author.get('name'), author.get('bio')]).toEqual(['Bea', 'old']);
      await author.reload();
      expect(author.get('bio')).toBe('new');
    }));

  it('honours paranoid: a soft-deleted row needs paranoid: false', () =>
    setup(async ({ Author }) => {
      const author = await Author.create({ name: 'Ann' });
      await author.destroy();
      await expect(author.reload()).rejects.toBeInstanceOf(InstanceError);
      await author.reload({ paranoid: false });
      expect(author.get('deletedAt')).toBeInstanceOf(Date);
    }));

  it('applies lock inside a transaction and runs the find hooks unless hooks is false', () =>
    setup(async ({ sequelize, Author }) => {
      const seen: string[] = [];
      Author.beforeFind(() => {
        seen.push('beforeFind');
      });
      const author = await Author.create({ name: 'Ann' });
      await sequelize.transaction(async (transaction) => {
        await author.reload({ transaction, lock: transaction.LOCK.UPDATE });
      });
      await author.reload({ hooks: false });
      expect(seen).toEqual(['beforeFind']);
    }));

  it('discards unsaved changes and resets the change tracking', () =>
    setup(async ({ Author }) => {
      const author = await Author.create({ name: 'Ann' });
      author.set('name', 'Zed');
      await author.reload();
      expect([author.get('name'), author.changed()]).toEqual(['Ann', false]);
    }));

  it('throws InstanceError when the row is gone', () =>
    setup(async ({ Author }) => {
      const author = await Author.create({ name: 'Ann' });
      await Author.destroy({ where: { id: author.get('id') }, force: true });
      await expect(author.reload()).rejects.toThrow(/does not exist anymore/);
    }));
});
