import { DataTypes, Model, Op, type Sequelize } from 'postgrelize';
import type {
  CreationOptional,
  FindOptions,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  NonAttribute,
} from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region models
  class Author extends Model<InferAttributes<Author>, InferCreationAttributes<Author>> {
    declare id: CreationOptional<number>;
    declare name: string;
    declare posts?: NonAttribute<Post[]>;
    declare getPosts: (options?: FindOptions) => Promise<Post[]>;
    declare countPosts: (options?: FindOptions) => Promise<number>;
    declare createPost: (values: Partial<InferCreationAttributes<Post>>) => Promise<Post>;
  }

  class Post extends Model<InferAttributes<Post>, InferCreationAttributes<Post>> {
    declare id: CreationOptional<number>;
    declare title: string;
    declare authorId: ForeignKey<number>;
    declare author?: NonAttribute<Author>;
    declare tags?: NonAttribute<Tag[]>;
    declare addTags: (tags: Tag[]) => Promise<void>;
  }

  class Tag extends Model<InferAttributes<Tag>, InferCreationAttributes<Tag>> {
    declare id: CreationOptional<number>;
    declare label: string;
  }

  Author.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.TEXT, allowNull: false },
    },
    { sequelize },
  );
  Post.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.TEXT, allowNull: false },
    },
    { sequelize },
  );
  Tag.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      label: { type: DataTypes.TEXT, allowNull: false },
    },
    { sequelize },
  );

  Author.hasMany(Post, { as: 'posts', foreignKey: 'authorId' });
  Post.belongsTo(Author, { as: 'author', foreignKey: 'authorId' });
  Post.belongsToMany(Tag, { as: 'tags', through: 'PostTags' });
  Tag.belongsToMany(Post, { as: 'posts', through: 'PostTags' });

  await sequelize.sync();
  // #endregion models

  // #region nested-create
  // Nested values are not creation attributes: pass them as a variable, not an object literal.
  const values = { name: 'Ann', posts: [{ title: 'Hello' }, { title: 'PostgreSQL tips' }] };
  const ann = await Author.create(values, { include: [{ association: 'posts' }] });
  // #endregion nested-create

  // #region accessors
  const sql = await Tag.create({ label: 'sql' });
  const [tips] = await ann.getPosts({ where: { title: { [Op.like]: '%tips' } } });
  await tips?.addTags([sql]);
  await ann.createPost({ title: 'Drafts' });
  const postCount = await ann.countPosts();
  // #endregion accessors

  // #region include
  const authors = await Author.findAll({
    include: [
      {
        association: 'posts',
        required: true,
        include: [{ association: 'tags', where: { label: 'sql' }, through: { attributes: [] } }],
      },
    ],
  });
  const withAuthor = await Post.findAll({
    include: [{ association: 'author', attributes: ['name'] }],
    order: [['id', 'ASC']],
  });
  const separate = await Author.findAll({
    include: [{ association: 'posts', separate: true, order: [['title', 'ASC']] }],
  });
  // #endregion include

  const titles = authors[0]?.posts?.map((post) => post.title);
  if (
    postCount !== 3 ||
    JSON.stringify(titles) !== '["PostgreSQL tips"]' ||
    authors[0]?.posts?.[0]?.tags?.[0]?.label !== 'sql' ||
    withAuthor[0]?.author?.name !== 'Ann' ||
    JSON.stringify(separate[0]?.posts?.map((post) => post.title)) !==
      '["Drafts","Hello","PostgreSQL tips"]'
  ) {
    throw new Error('associations example: unexpected result');
  }
};
