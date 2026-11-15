import { describe, expect, it } from 'vitest';
import {
  AllowNull,
  AutoIncrement,
  BeforeCreate,
  BelongsTo,
  BelongsToMany,
  Column,
  Comment,
  DataTypes,
  Default,
  DefaultScope,
  ForeignKey,
  HasMany,
  Index,
  Model,
  PrimaryKey,
  Scopes,
  Sequelize,
  Table,
  Unique,
} from '../../src/index.ts';

// Compiled with TC39 decorators by `unit` and with legacy decorators by `decorators-legacy`.
class Entity extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataTypes.INTEGER)
  id!: number;
}

@Table({ tableName: 'authors', timestamps: false })
@DefaultScope(() => ({ where: { active: true } }))
@Scopes({ named: (name: string) => ({ where: { name } }) })
class Author extends Entity {
  @Index('author_name_idx')
  @AllowNull(false)
  @Column(DataTypes.TEXT)
  name!: string;

  @Index('author_name_idx')
  @Column(DataTypes.TEXT)
  surname!: string | null;

  @Unique
  @Comment('login')
  @Column({ type: DataTypes.STRING(64) })
  email!: string;

  @Default(true)
  @Column(DataTypes.BOOLEAN)
  active!: boolean;

  @HasMany(() => Book)
  books?: Book[];

  @BeforeCreate
  static trim(): void {}
}

@Table
class Book extends Entity {
  @ForeignKey(() => Author)
  @Column(DataTypes.INTEGER)
  authorId!: number;

  @BelongsTo(() => Author)
  author?: Author;

  @BelongsToMany(() => Tag, () => BookTag)
  tags?: Tag[];
}

class Tag extends Entity {
  @Column(DataTypes.TEXT)
  label!: string;
}

class BookTag extends Model {
  @ForeignKey(() => Book)
  @PrimaryKey
  @Column(DataTypes.INTEGER)
  bookId!: number;

  @ForeignKey(() => Tag)
  @PrimaryKey
  @Column(DataTypes.INTEGER)
  tagId!: number;
}

/** Shared checks of the public decorators, run once per decorator calling convention. */
export const describeDecorators = (): void => {
  const sequelize = new Sequelize('postgres://u:p@localhost:1/db', { logging: false });
  sequelize.addModels([Author, Book, Tag, BookTag]);

  describe('decorated models', () => {
    it('define attributes like Model.init', () => {
      expect(Object.keys(Author.rawAttributes)).toEqual([
        'id',
        'name',
        'surname',
        'email',
        'active',
      ]);
      expect(Author.rawAttributes.id).toMatchObject({ primaryKey: true, autoIncrement: true });
      expect(Author.rawAttributes.name?.allowNull).toBe(false);
      expect(Author.rawAttributes.email).toMatchObject({ comment: 'login', unique: true });
      expect(Author.rawAttributes.email?.type.sqlType).toBe('VARCHAR(64)');
      expect(Author.rawAttributes.active?.defaultValue).toBe(true);
      expect(Author.tableName).toBe('authors');
      expect(Book.tableName).toBe('Books');
    });

    it('collect indexes by name and apply scopes and hooks', () => {
      expect(Author.options.indexes).toEqual([
        { name: 'author_name_idx', fields: ['name', 'surname'] },
      ]);
      expect(Author.hasHook('beforeCreate')).toBe(true);
      expect(Book.hasHook('beforeCreate')).toBe(false);
      expect(() => Author.scope({ method: ['named', 'ann'] })).not.toThrow();
      expect(() => Author.scope('missing')).toThrow(/missing/);
    });

    it('add associations with the property name as alias and the @ForeignKey attributes', () => {
      expect(Author.associations.books).toMatchObject({
        associationType: 'HasMany',
        foreignKey: 'authorId',
      });
      expect(Book.associations.author).toMatchObject({
        associationType: 'BelongsTo',
        foreignKey: 'authorId',
      });
      expect(Book.associations.tags).toMatchObject({
        associationType: 'BelongsToMany',
        foreignKey: 'bookId',
        otherKey: 'tagId',
      });
    });

    it('keep attribute accessors working on instances', () => {
      const author = Author.build({ name: 'ann' });
      expect(author.name).toBe('ann');
      author.name = 'bob';
      expect(author.dataValues.name).toBe('bob');
      expect(Object.hasOwn(author, 'name')).toBe(false);
    });

    it('reject attributes without a type and hooks on instance methods', () => {
      class Untyped extends Model {
        @PrimaryKey
        id!: number;
      }
      expect(() => sequelize.addModels([Untyped])).toThrow('Untyped.id has no type');
      expect(() => {
        class Bad extends Model {
          @BeforeCreate
          method(): void {}
        }
        return Bad;
      }).toThrow('static methods only');
    });
  });
};
