# Decorators

Decorators are an optional way to define models. They produce exactly what `Model.init` and the association methods produce, so everything else in this guide (queries, hooks, scopes, sync) works unchanged. The names follow `sequelize-typescript`, which makes moving from it straightforward.

## Defining models

Decorate the class and its fields, then register the classes with `sequelize.addModels`:

<<< @/examples/decorators.ts#models{ts}

`addModels` initializes every class with `Model.init` first and adds the associations afterwards, so classes can refer to each other in any order (`() => Post` is evaluated when `addModels` runs). A model class belongs to one `Sequelize` instance at a time.

The classes then work like any other model:

<<< @/examples/decorators.ts#use{ts}

## Reference

| Decorator                                                                                                            | Target        | Equivalent                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `@Table(options?)`                                                                                                   | class         | `Model.init` options without `sequelize` (`tableName`, `schema`, `paranoid`, `indexes`, `hooks`, …)          |
| `@DefaultScope(options \| () => options)`, `@Scopes({ … } \| () => ({ … }))`                                         | class         | `defaultScope`, `scopes`                                                                                     |
| `@Column(type \| options)`                                                                                           | field         | an entry of the `attributes` argument of `init`                                                              |
| `@PrimaryKey`, `@AutoIncrement`, `@AllowNull(bool?)`, `@Default(value)`, `@Unique(nameOrOptions?)`, `@Comment(text)` | field         | `primaryKey`, `autoIncrement`, `allowNull`, `defaultValue`, `unique`, `comment`                              |
| `@Index(nameOrOptions?)`                                                                                             | field         | an entry of `indexes`; fields that share an index name form one composite index                              |
| `@CreatedAt`, `@UpdatedAt`, `@DeletedAt`                                                                             | field         | `createdAt`, `updatedAt`, `deletedAt` names; `@DeletedAt` also sets `paranoid: true` unless `@Table` sets it |
| `@ForeignKey(() => Model)`                                                                                           | field         | tells association decorators which attribute is the foreign key                                              |
| `@HasOne`, `@HasMany`, `@BelongsTo`, `@BelongsToMany(() => Model, through, options?)`                                | field         | `hasOne`, `hasMany`, `belongsTo`, `belongsToMany`; the property name is the alias (`as`)                     |
| `@BeforeCreate`, `@AfterCreate`, `@BeforeFind`, … (one per model hook)                                               | static method | `Model.addHook('beforeCreate', fn)` / the `hooks` option                                                     |

Details worth knowing:

- **Types are explicit.** There is no `reflect-metadata`, so the column type is never inferred from the TypeScript type. Pass a `DataTypes` value or `{ type }` to `@Column`; an attribute without a type makes `addModels` throw.
- **Foreign keys.** `@HasMany(() => Post)` uses the attribute of `Post` marked `@ForeignKey(() => ThisModel)`. `@BelongsTo(() => Author)` uses the attribute of this class marked `@ForeignKey(() => Author)`. `@BelongsToMany` reads `foreignKey` and `otherKey` from the junction model. Pass `foreignKey` / `otherKey` in the options to override. Without any of them, the v6 defaults apply.
- **Hooks** are static methods and receive the same arguments as hooks added with `addHook`.
- **Inheritance.** Attributes, associations and hooks of base classes are inherited. A base class that is not passed to `addModels` is not a model.
- **Instance fields.** Declare decorated attributes as fields with `!` (`name!: string`). Under TC39 decorators the field is removed from each instance right after construction, so the attribute getters and setters of the model keep working.

## Compiler settings

The decorators accept both calling conventions, so they work in either mode:

- **Standard decorators** (TypeScript 5+ without `experimentalDecorators`, which is the default). Use a toolchain that lowers them: `tsc`, `esbuild` 0.21+, `swc`, `tsx`, or and Vitest with a TypeScript-based lowering step (`build/decorators-plugin.ts` in this repository). Node cannot run decorator syntax natively.
- **Legacy decorators** (`"experimentalDecorators": true`), as used by NestJS and `sequelize-typescript`. Also set `"useDefineForClassFields": false`, otherwise class fields shadow the attribute accessors (this mode has no hook to remove them).

postgrelize itself ships plain JavaScript and needs no decorator support from consumers. Importing it defines `Symbol.metadata` when the runtime has not, which standard decorators need to find the class of a field.

## Security

Decorators add no new inputs to SQL: they feed the same options as `Model.init` and the association methods, whose values are bound parameters or quoted identifiers like everything else.
