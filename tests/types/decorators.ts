// Compile-time checks run by `npm run typecheck`: where each public decorator may be applied.
import {
  Column,
  DataTypes,
  ForeignKey,
  HasMany,
  BeforeCreate,
  Model,
  PrimaryKey,
  Sequelize,
  Table,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from '../../src/index.ts';

@Table({ tableName: 'typed_users', timestamps: false })
class TypedUser extends Model<InferAttributes<TypedUser>, InferCreationAttributes<TypedUser>> {
  @PrimaryKey
  @Column(DataTypes.INTEGER)
  id!: CreationOptional<number>;

  @Column({ type: DataTypes.STRING, allowNull: false })
  name!: string;

  @ForeignKey(() => TypedUser)
  @Column(DataTypes.INTEGER)
  managerId!: ForeignKey<number>;

  @HasMany(() => TypedUser)
  reports?: TypedUser[];

  @BeforeCreate
  static normalize(user: TypedUser): void {
    user.name = user.name.trim();
  }
}

const sequelize = new Sequelize('postgres://localhost/db', { logging: false });
sequelize.addModels([TypedUser]);
const created: Promise<TypedUser> = TypedUser.create({ name: 'ann', managerId: 1 });
void created;

class Misuse {
  // @ts-expect-error attribute decorators apply to fields, not methods
  @Column(DataTypes.TEXT)
  method(): void {}

  // @ts-expect-error hook decorators apply to methods, not fields
  @BeforeCreate
  field = 1;
}
void Misuse;

// @ts-expect-error @PrimaryKey is an attribute decorator
@PrimaryKey
class WrongTarget extends Model {}
void WrongTarget;
