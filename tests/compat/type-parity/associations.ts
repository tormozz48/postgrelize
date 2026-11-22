import {
  Model,
  type Association,
  type BelongsTo,
  type HasMany,
  type HasOne,
  type InferAttributes,
  type BelongsToGetAssociationMixin,
  type BelongsToManyGetAssociationsMixin,
  type BelongsToSetAssociationMixin,
  type BelongsToCreateAssociationMixin,
  type HasManyAddAssociationMixin,
  type HasManyCountAssociationsMixin,
  type HasManyCreateAssociationMixin,
  type HasManyGetAssociationsMixin,
  type HasManyHasAssociationMixin,
  type HasManyRemoveAssociationsMixin,
  type HasManySetAssociationsMixin,
  type HasOneGetAssociationMixin,
  type HasOneSetAssociationMixin,
  type InferCreationAttributes,
  type NonAttribute,
} from '@orm';

class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
  declare id: number;
  declare files?: NonAttribute<File[]>;
  declare getFiles: HasManyGetAssociationsMixin<File>;
  declare addFile: HasManyAddAssociationMixin<File, number>;
  declare hasFile: HasManyHasAssociationMixin<File, number>;
  declare setFiles: HasManySetAssociationsMixin<File, number>;
  declare removeFiles: HasManyRemoveAssociationsMixin<File, number>;
  declare countFiles: HasManyCountAssociationsMixin;
  declare createFile: HasManyCreateAssociationMixin<File, 'clientId'>;
  declare getProfile: HasOneGetAssociationMixin<Profile>;
  declare setProfile: HasOneSetAssociationMixin<Profile, number>;
  declare getTags: BelongsToManyGetAssociationsMixin<Tag>;
  static files: Association<Client, File>;
  declare static associations: {
    files: Association<Client, File>;
    profile: HasOne<Client, Profile>;
    tags: Association<Client, Tag>;
  };
}

class File extends Model<InferAttributes<File>, InferCreationAttributes<File>> {
  declare id: number;
  declare clientId: number;
  declare client?: NonAttribute<Client>;
  declare getClient: BelongsToGetAssociationMixin<Client>;
  declare setClient: BelongsToSetAssociationMixin<Client, number>;
  declare createClient: BelongsToCreateAssociationMixin<Client>;
  static client: Association<File, Client>;
  declare static associations: { client: BelongsTo<File, Client> };
}

class Profile extends Model<InferAttributes<Profile>, InferCreationAttributes<Profile>> {
  declare id: number;
}
class Tag extends Model<InferAttributes<Tag>, InferCreationAttributes<Tag>> {
  declare id: number;
}

export async function associations(client: Client, file: File): Promise<void> {
  const owner: Client = await file.getClient({ scope: false });
  void owner;
  const files: File[] = await client.getFiles({ where: { id: 1 } });
  void files;
  const hasMany: HasMany<Client, File> = Client.hasMany(File, { foreignKey: 'clientId' });
  const belongsTo: BelongsTo<File, Client> = File.belongsTo(Client, { foreignKey: 'clientId' });
  const hasOne: HasOne<Client, Profile> = Client.hasOne(Profile);
  const kind: string = hasMany.associationType;
  void kind;
  void belongsTo.source;
  void hasOne.target;
  await client.addFile(1);
  await client.countFiles();
  await client.getProfile();
  await client.getTags();
}
