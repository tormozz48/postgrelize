# Associations

`belongsTo`, `hasOne`, `hasMany` and `belongsToMany` work as in Sequelize v6, including aliases, custom keys, junction models, eager loading with `include`, accessor methods and nested creation.

## Defining associations

<<< @/examples/associations.ts#models{ts}

Notes on the example:

- `as` names the association. It is the key of the loaded value (`author.posts`) and the base of the accessor names (`getPosts`, `countPosts`, `createPost`).
- `foreignKey` sets the foreign key attribute; without it, v6 naming applies (`AuthorId` for `Author.hasMany(Post)`).
- `through: 'PostTags'` creates the junction model automatically. Pass a model to add your own columns to the junction table.
- `ForeignKey<number>` and `NonAttribute<...>` keep these fields out of the creation attributes.
- The accessor methods exist at runtime; declare the ones you use with `declare` so TypeScript knows them. postgrelize does not export the v6 `HasManyGetAssociationsMixin`-style helper types, so write the signatures directly.

`sync()` creates the foreign key constraints with the v6 defaults: `ON DELETE SET NULL` for nullable foreign keys; for `allowNull: false` ones, `NO ACTION` with `belongsTo` and `CASCADE` with `hasOne` / `hasMany`; `ON DELETE CASCADE` for junction tables, and `ON UPDATE CASCADE`. Override them with `onDelete` / `onUpdate`, or skip constraints with `constraints: false`.

Default aliases and foreign keys come from the model's `name` init option when it is set (`name: { singular: 'user', plural: 'users' }`, as in v6), otherwise from the inflected `modelName`. An `include` entry takes a custom join condition with `on`; it replaces the key condition of `belongsTo`, `hasOne` and `hasMany` includes (not of `belongsToMany`).

## Nested creation

`create`, `build` and `bulkCreate` accept nested values for associations listed in `include`. postgrelize inserts the parent, then the children with the foreign keys set:

<<< @/examples/associations.ts#nested-create{ts}

Nested creation works for all four association types and for multiple levels (`include: [{ association: 'posts', include: ['comments'] }]`). For `belongsToMany`, the junction row can carry values: `{ label: 'admin', UserRoles: { level: 'high' } }`.

`bulkCreate` with `include` creates the nested records with one nested `bulkCreate` per include, like v6: the `beforeBulkCreate` / `afterBulkCreate` hooks of the nested model run once with all its rows and receive the options of their include entry (`include: [{ model: User, myOption: 'x' }]` reaches them as `options.myOption`). It does not run the per-row `beforeCreate` / `afterCreate` hooks; pass `individualHooks: true` for those.

## Accessors

Instances get the v6 accessor methods:

| Association                | Methods                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `belongsTo`, `hasOne`      | `get<Name>`, `set<Name>`, `create<Name>`                                                                                                             |
| `hasMany`, `belongsToMany` | `get<Names>`, `count<Names>`, `has<Name>` / `has<Names>`, `set<Names>`, `add<Name>` / `add<Names>`, `remove<Name>` / `remove<Names>`, `create<Name>` |

<<< @/examples/associations.ts#accessors{ts}

`get<Names>` and `count<Names>` take find options (`where`, `order`, `limit`, `transaction`, ...). Return values follow v6:

- `hasOne` `set<Name>` accepts an instance, a primary key (a stub is built from the key, no lookup) or `null`. It resolves to the saved instance, or to `null` when the instance is already linked or the association is cleared.
- `belongsTo` `set<Name>(value, { save: false })` only sets the foreign key and resolves to `undefined`.
- `belongsToMany` `get<Names>` attaches the junction row under the junction model name. `joinTableAttributes` picks its columns (`[]` omits it); with `raw: true` the rows are flat and carry `Junction.column` keys.
- Including a model with an unknown `as`, or a model associated several times without `as`, rejects with `EagerLoadingError`.

## Eager loading

`include` loads associations in the same query with `LEFT OUTER JOIN` (or `INNER JOIN` with `required: true`, which is implied when the include has a `where`):

<<< @/examples/associations.ts#include{ts}

Include options follow v6: `association` or `model` + `as`, `where`, `required`, `right`, `attributes`, nested `include`, `paranoid`, `through: { attributes, where }` for `belongsToMany`, and `all: true` (or `all: 'BelongsTo'`, `'HasMany'`, … to pick association types, `nested: true` to recurse; other options of that entry apply to every generated include). `as` also takes the v6 `{ singular, plural }` form.

- **`limit` with multi-row includes.** As in v6, a `limit` on the main query together with a `hasMany` / `belongsToMany` include moves the main table into a subquery, so the limit counts parent rows. `subQuery: false` turns this off.
- **`separate: true`** (hasMany only) loads the association with a second query instead of a join, with its own `order` and `limit` (applied per parent, as in Sequelize v6). A `hasMany` include with `limit` is separate unless you pass `separate: false`. This avoids row multiplication when a parent has many children.
- **`$nested.attr$` keys** in the top-level `where` filter on included columns, as in v6.

- **`minifyAliases: true`** (constructor option, as in v6) shortens the aliases of included columns (`Posts.Comments.title` becomes `_0`) and of table aliases of 64 or more characters, then maps the rows back. PostgreSQL identifiers hold 63 bytes: without the option a deeply nested include with long association names gets truncated column aliases that can collide, and attributes go missing. It is off by default and applies to the joined include query of `findAll`, `findOne`, `findByPk` and `findAndCountAll`; `separate` includes run their own query with their own aliases. SQL logs show the short names. Unlike v6, aliases of attributes you rename yourself (`attributes: [[fn(...), 'total']]`) are left as written.

Counting with includes: `count({ include })` counts joined rows, as in v6; add `distinct: true` to count parent rows.

## Differences from Sequelize v6

Associations behave like v6, including default scopes of included models (a scoped include with a `where` becomes required) and `Model.unscoped()` or `Model.scope(...)` passed as the include `model`. Three v6 bugs are fixed (see [Sequelize issues fixed](/sequelize-issues)):

- `belongsToMany` with a custom `sourceKey` and `limit` returns the right rows.
- A top-level `$include.attr$` condition with a `hasMany` include and `limit` produces valid SQL: the limit subquery is turned off, so `limit` counts joined rows.
- Nested `create` with a built instance as a child (`Post.create({ Comments: [Comment.build(...)] }, { include: [Comment] })`) saves and links the instance; v6 silently drops it.

## API reference

- [`Model`](/api/classes/Model) — `belongsTo`, `hasOne`, `hasMany`, `belongsToMany`
- [`AssociationOptions`](/api/type-aliases/AssociationOptions), [`BelongsToManyOptions`](/api/type-aliases/BelongsToManyOptions)
- [`IncludeOptions`](/api/type-aliases/IncludeOptions)
