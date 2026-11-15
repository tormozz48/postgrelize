import { describe, expect, it } from 'vitest';
import {
  BeforeCreate,
  BelongsTo,
  BelongsToMany,
  Column,
  DataTypes,
  DefaultScope,
  ForeignKey,
  HasOne,
  Index,
  Model,
  PrimaryKey,
  Scopes,
  Sequelize,
  Table,
} from '../../../src/index.ts';

const sequelize = new Sequelize('postgres://u:p@localhost:1/db', { logging: false });

describe('decorator metadata', () => {
  it('merges @Table hooks with @BeforeCreate methods and keeps both callable', async () => {
    const calls: string[] = [];
    const tableHook = (): void => {
      calls.push('table');
    };
    @Table({ hooks: { beforeCreate: tableHook, afterCreate: [tableHook, tableHook] } })
    class Hooked extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;

      @BeforeCreate
      static mark(): void {
        calls.push('method');
      }
    }
    sequelize.addModels([Hooked]);
    expect(Hooked.hasHook('beforeCreate')).toBe(true);
    expect(Hooked.hasHook('afterCreate')).toBe(true);
    expect(Hooked.hasHook('beforeDestroy')).toBeUndefined();
    await Hooked.runHooks('beforeCreate');
    expect(calls).toEqual(['table', 'method']);
    await Hooked.runHooks('afterCreate');
    expect(calls).toEqual(['table', 'method', 'table', 'table']);
  });

  it('accepts plain scope objects and unnamed or option-style @Index', () => {
    @DefaultScope({ where: { active: true } })
    @Scopes({ recent: { order: [['id', 'DESC']] } })
    class Plain extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;

      @Index
      @Column(DataTypes.TEXT)
      slug!: string;

      @Index({ name: 'plain_unique', unique: true })
      @Column(DataTypes.TEXT)
      code!: string;

      @Index()
      @Column(DataTypes.TEXT)
      other!: string;

      @Index({ unique: true })
      @Column(DataTypes.TEXT)
      email!: string;
    }
    sequelize.addModels([Plain]);
    expect(Plain.options.indexes).toEqual([
      { fields: ['slug'] },
      { name: 'plain_unique', unique: true, fields: ['code'] },
      { fields: ['other'] },
      { unique: true, fields: ['email'] },
    ]);
    expect(() => Plain.scope('missing')).toThrow(/missing/);
    expect(() => Plain.scope('recent')).not.toThrow();
  });

  it('names attributes declared with symbol keys by their description', () => {
    const tag = Symbol('tag');
    class Tagged extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;

      @Column(DataTypes.TEXT)
      [tag]!: string;
    }
    sequelize.addModels([Tagged]);
    expect(Object.keys(Tagged.rawAttributes).slice(0, 2)).toEqual(['id', 'tag']);
  });

  it('applies associations without matching @ForeignKey attributes and through-table variants', () => {
    class Junction extends Model {
      @ForeignKey(() => Owner)
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      ownerId!: number;

      @ForeignKey(() => Label)
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      labelId!: number;
    }
    class Owner extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;

      @HasOne(() => Profile)
      profile?: Profile;

      @BelongsToMany(() => Label, 'owner_labels')
      labels?: Label[];

      @BelongsToMany(() => Label, { model: 'owner_labels_named' })
      namedLabels?: Label[];

      @BelongsToMany(() => Label, { model: Junction })
      viaModel?: Label[];
    }
    class Profile extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;

      @ForeignKey(() => Owner)
      @Column(DataTypes.INTEGER)
      ownerId!: number;

      @BelongsTo(() => Owner)
      owner?: Owner;
    }
    class Label extends Model {
      @PrimaryKey
      @Column(DataTypes.INTEGER)
      id!: number;
    }
    sequelize.addModels([Junction, Owner, Profile, Label]);
    expect(Owner.associations['profile']).toMatchObject({
      associationType: 'HasOne',
      foreignKey: 'ownerId',
    });
    expect(Owner.associations['labels']).toMatchObject({ associationType: 'BelongsToMany' });
    expect(Owner.associations['namedLabels']).toMatchObject({ associationType: 'BelongsToMany' });
    expect(Owner.associations['viaModel']).toMatchObject({
      associationType: 'BelongsToMany',
      foreignKey: 'ownerId',
      otherKey: 'labelId',
    });
  });
});

describe('legacy decorator call signatures', () => {
  it('apply the same metadata when called directly with (prototype, key)', () => {
    class Legacy extends Model {
      declare id: number;
      declare name: string;
    }
    const decorate = (key: string, ...decorators: ((...args: never[]) => unknown)[]): void => {
      for (const decorator of decorators.toReversed()) {
        (decorator as (...args: unknown[]) => unknown)(Legacy.prototype, key);
      }
    };
    decorate('id', PrimaryKey, Column(DataTypes.INTEGER));
    decorate('name', Index('legacy_name'), Column(DataTypes.TEXT));
    (Table({ tableName: 'legacy_things' }) as (...args: unknown[]) => unknown)(Legacy);
    sequelize.addModels([Legacy]);
    expect(Legacy.tableName).toBe('legacy_things');
    expect(Object.keys(Legacy.rawAttributes).slice(0, 2)).toEqual(['id', 'name']);
    expect(Legacy.rawAttributes['id']).toMatchObject({ primaryKey: true });
    expect(Legacy.options.indexes).toEqual([{ name: 'legacy_name', fields: ['name'] }]);
  });
});
