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

`sync()` creates the foreign key constraints with the v6 defaults: `ON DELETE SET NULL` for nullable foreign keys (`NO ACTION` for `allowNull: false`), `ON DELETE CASCADE` for junction tables, and `ON UPDATE CASCADE`. Override them with `onDelete` / `onUpdate`, or skip constraints with `constraints: false`.

## Nested creation

`create`, `build` and `bulkCreate` accept nested values for associations listed in `include`. postgrelize inserts the parent, then the children with the foreign keys set:

<<< @/examples/associations.ts#nested-create{ts}

Nested creation works for all four association types and for multiple levels (`include: [{ association: 'posts', include: ['comments'] }]`). For `belongsToMany`, the junction row can carry values: `{ label: 'admin', UserRoles: { level: 'high' } }`.

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

Include options follow v6: `association` or `model` + `as`, `where`, `required`, `right`, `attributes`, nested `include`, `paranoid`, `through: { attributes, where }` for `belongsToMany`, and `all: true`.

- **`limit` with multi-row includes.** As in v6, a `limit` on the main query together with a `hasMany` / `belongsToMany` include moves the main table into a subquery, so the limit counts parent rows. `subQuery: false` turns this off.
- **`separate: true`** (hasMany only) loads the association with a second query instead of a join, with its own `order` and `limit` (applied per parent, as in Sequelize v6). This avoids row multiplication when a parent has many children.
- **`$nested.attr$` keys** in the top-level `where` filter on included columns, as in v6.

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
