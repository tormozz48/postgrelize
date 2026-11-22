import { it } from 'vitest';
import { expectSameError, expectSameResult } from '../support/compat.ts';

it('an include by model picks the association without an explicit alias when there are several', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Product = sequelize.define('Product', { title: lib.DataTypes.STRING });
    const Tag = sequelize.define('Tag', { name: lib.DataTypes.STRING });
    Product.belongsToMany(Tag, { through: 'product_tag' });
    Tag.belongsToMany(Product, { through: 'product_tag' });
    Product.belongsTo(Tag, { as: 'Category' });
    await sequelize.sync({ force: true });
    const tag = await Tag.create({ name: 'blue' });
    const product = await Product.create({ title: 'p' });
    await (product as unknown as { addTag(tag: unknown): Promise<void> }).addTag(tag);
    const found = await Product.findAll({ include: [{ model: Tag }] });
    return found.map((row) => ({
      title: row.get('title'),
      tags: (row as unknown as { Tags: { get(key: string): unknown }[] }).Tags.map((item) =>
        item.get('name'),
      ),
    }));
  }));

it('an include by model with only aliased associations to it is still ambiguous', () =>
  expectSameError('', async (lib, sequelize) => {
    const Product = sequelize.define('Product', { title: lib.DataTypes.STRING });
    const Tag = sequelize.define('Tag', { name: lib.DataTypes.STRING });
    Product.belongsTo(Tag, { as: 'Category' });
    Product.belongsTo(Tag, { as: 'Brand' });
    await sequelize.sync({ force: true });
    return Product.findAll({ include: [{ model: Tag }] });
  }));
