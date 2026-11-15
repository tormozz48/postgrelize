import {
  AllowNull,
  AutoIncrement,
  BeforeCreate,
  BelongsTo,
  BelongsToMany,
  Column,
  DataTypes,
  DefaultScope,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Scopes,
  Table,
  Unique,
  type Sequelize,
} from 'postgrelize';

const expectEqual = (actual: unknown, expected: unknown, what: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region models
  @Table({ tableName: 'authors' })
  @DefaultScope({ where: { active: true } })
  @Scopes({ byName: (name: string) => ({ where: { name } }) })
  class Author extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataTypes.INTEGER)
    id!: number;

    @AllowNull(false)
    @Column(DataTypes.TEXT)
    name!: string;

    @Unique
    @Column(DataTypes.STRING(120))
    email!: string;

    @Column({ type: DataTypes.BOOLEAN, defaultValue: true })
    active!: boolean;

    @HasMany(() => Post)
    posts?: Post[];

    @BeforeCreate
    static normalize(author: Author): void {
      author.name = author.name.trim();
    }
  }

  @Table({ tableName: 'posts' })
  class Post extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataTypes.INTEGER)
    id!: number;

    @Column(DataTypes.TEXT)
    title!: string;

    @ForeignKey(() => Author)
    @Column(DataTypes.INTEGER)
    authorId!: number;

    @BelongsTo(() => Author)
    author?: Author;

    @BelongsToMany(() => Tag, () => PostTag)
    tags?: Tag[];
  }

  @Table({ tableName: 'tags' })
  class Tag extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataTypes.INTEGER)
    id!: number;

    @Column(DataTypes.TEXT)
    label!: string;
  }

  @Table({ tableName: 'post_tags', timestamps: false })
  class PostTag extends Model {
    @ForeignKey(() => Post)
    @PrimaryKey
    @Column(DataTypes.INTEGER)
    postId!: number;

    @ForeignKey(() => Tag)
    @PrimaryKey
    @Column(DataTypes.INTEGER)
    tagId!: number;
  }

  sequelize.addModels([Author, Post, Tag, PostTag]);
  await sequelize.sync();
  // #endregion models

  // #region use
  const ann = await Author.create({ name: '  Ann ', email: 'ann@example.com' });
  const post = (await Post.create({ title: 'Hello', authorId: ann.id })) as Post & {
    addTag: (tag: Tag) => Promise<void>;
  };
  await post.addTag(await Tag.create({ label: 'news' }));

  const posts = await Post.findAll({ include: ['author', 'tags'] });
  // #endregion use

  expectEqual(ann.name, 'Ann', 'hook ran');
  expectEqual(
    posts.map((item) => [item.author?.name, item.tags?.map((tag) => tag.label)]),
    [['Ann', ['news']]],
    'associations',
  );
  expectEqual((await Author.scope({ method: ['byName', 'Ann'] }).findAll()).length, 1, 'scope');
  expectEqual(Object.keys(Author.associations), ['posts'], 'association alias');
};
