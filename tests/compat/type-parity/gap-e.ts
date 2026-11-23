import { DataTypes, Model, Sequelize, type IncludeOptions, type CreateOptions } from '@orm';

declare const sequelize: Sequelize;

class Item extends Model {
  declare id: number;
  declare lo: number;
  declare hi: number;
  declare label: string | null;
}

Item.init(
  {
    lo: DataTypes.INTEGER,
    hi: DataTypes.INTEGER,
    label: DataTypes.STRING,
  },
  {
    sequelize,
    validate: {
      ordered(this: Item) {
        if (this.lo > this.hi) throw new Error('lo must not exceed hi');
      },
      labelled() {
        if (this.label === null) throw new Error('label required');
      },
    },
  },
);

const mutateIncludes = (include: IncludeOptions, options: CreateOptions): void => {
  include.paranoid = false;
  include.required = true;
  include.where = { id: 1 };
  options.fields = ['id'];
};

const withModule = new Sequelize('postgres://localhost/db', { dialectModule: {} });

const maxLabel = (): Promise<string | null> => Item.max<string | null, Item>('label');

export { mutateIncludes, withModule, maxLabel };
