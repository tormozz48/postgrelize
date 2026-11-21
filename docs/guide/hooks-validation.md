# Hooks and validation

Lifecycle hooks and attribute / model validators work as in Sequelize v6. postgrelize adds validation with any [Standard Schema](https://standardschema.dev) library, such as zod, valibot or arktype.

## Hooks

Register hooks in the model options (`hooks`), with the shorthand methods (`Model.beforeCreate(fn)`), or with `addHook(type, [name], fn)`. A named hook can be removed later with `removeHook(type, name)`.

<<< @/examples/hooks-validation.ts#hooks{ts}

Hooks may be async; postgrelize awaits them in registration order. `before*` hooks may change the instance or the options object; throwing from a hook aborts the operation.

| Operation                              | Hooks (in order)                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `create`, `save` of a new record       | `beforeValidate`, `afterValidate` (or `validationFailed`), `beforeCreate`, `afterCreate`                                   |
| `save` / `update` of an instance       | `beforeValidate`, `afterValidate` (or `validationFailed`), `beforeUpdate`, `afterUpdate`                                   |
| instance `destroy` / `restore`         | `beforeDestroy` / `afterDestroy`, `beforeRestore` / `afterRestore`                                                         |
| `upsert`                               | `beforeUpsert`, `afterUpsert`                                                                                              |
| `bulkCreate`, `Model.insert`           | `beforeBulkCreate`, `afterBulkCreate`                                                                                      |
| `Model.update` / `destroy` / `restore` | `beforeBulkUpdate` / `afterBulkUpdate`, `beforeBulkDestroy` / `afterBulkDestroy`, `beforeBulkRestore` / `afterBulkRestore` |
| finders                                | `beforeFind`, `beforeFindAfterExpandIncludeAll`, `beforeFindAfterOptions`, `afterFind`; `beforeCount` for `count`          |
| connecting                             | `beforeConnect` (on the `Sequelize` instance; may change the connection config)                                            |

As in v6, `beforeSave` / `afterSave` hooks are registered as both create and update hooks, so they run in registration order together with `beforeCreate` / `beforeUpdate`. Bulk operations run per-row hooks only with `individualHooks: true`. Pass `hooks: false` to skip hooks for one call.

### Sequelize-level hooks

Hooks can also be registered for every model: through the `hooks` constructor option, with `sequelize.addHook(...)`, or as model defaults in `define: { hooks }`. Model hooks run first, then the Sequelize-level hooks:

```ts
const sequelize = new Sequelize(url, {
  hooks: { beforeCreate: (instance) => audit('create', instance) },
});
sequelize.addHook('beforeConnect', async (config) => {
  config.password = await fetchDatabaseToken(); // e.g. short-lived IAM tokens
});
```

On the `Sequelize` instance every hook that runs also has a shorthand as in v6 (`sequelize.beforeCreate(fn)`, `sequelize.afterConnect('name', fn)`, `sequelize.beforeBulkSync(fn)`, ...) next to `addHook`, `removeHook`, `hasHook(s)` and `runHooks`; models have `Model.beforeSync(fn)` / `Model.afterSync(fn)` besides the lifecycle shorthands. Hooks postgrelize never runs (`beforeDefine`, `beforeQuery`, `beforeAssociate`, ...) have no shorthand, and the class-level `Sequelize.addHook` is not provided (in v6 it only fires `beforeInit` / `afterInit`).

`afterConnect` runs once for every new pooled connection, after `beforeConnect`, with `(connection, config)` as in v6; `connection` is the `pg` client, so the hook can run session setup on it. If the hook throws, the connection is closed and the query that needed it rejects with that error.

```ts
sequelize.addHook('afterConnect', async (connection) => {
  await connection.query("SET idle_in_transaction_session_timeout = '30s'");
});
```

All v6 hook names are accepted, but connection and define hooks other than `beforeConnect` and `afterConnect` (`beforeDefine`, `beforeQuery`, ...) are not run yet. `beforeBulkSync` / `afterBulkSync` run around `sequelize.sync()` and `beforeSync` / `afterSync` around each model's sync (also `Model.sync()`); `hooks: false` skips them.

### Transactions in hooks

Hooks receive the options of the operation, including `options.transaction`. Pass it on to queries made inside the hook so they join the same transaction.

## Validators

Attribute validators go into `validate`: the validator.js-based built-ins of v6 (`isEmail`, `isUrl`, `len`, `min`, `max`, `isIn`, `notEmpty`, `is`, `not`, ...) with optional `{ args, msg }`, and custom functions that throw. An unknown validator name fails validation with `Invalid validator function: <name>` as a `ValidationErrorItem`, like v6. Model-level validators go into the `validate` model option and run with the instance as `this`:

<<< @/examples/hooks-validation.ts#validators{ts}

Validation runs before `create` and `save` (skip it with `validate: false`) and on `Model.update`. `bulkCreate` and `Model.insert` validate only with `validate: true`. `allowNull: false` violations are reported as validation errors before the query runs; set a custom message with `validate: { notNull: { msg } }`.

## Standard Schema

Any [Standard Schema](https://standardschema.dev) v1 object can validate a single attribute (`validate: { schema }`) or the whole row (`validationSchema` model option). Schema issues become `ValidationErrorItem`s with `validatorKey: 'schema'`, and the issue path selects the attribute:

<<< @/examples/hooks-validation.ts#standard-schema{ts}

The row schema receives all attribute values of the instance. postgrelize does not use the schema output: transformations (`z.coerce`, `.transform`) do not change the stored values. Use setters or hooks for that.

`validationSchema` is an extension. The model option `schema` keeps its v6 meaning (the PostgreSQL schema of the table).

## Validation errors

A failed validation rejects with `ValidationError`, whose `errors` array holds one `ValidationErrorItem` per problem, with `message`, `path` (attribute), `value`, `validatorKey` and `type`:

<<< @/examples/hooks-validation.ts#errors{ts}

Database constraint violations are reported separately, as `UniqueConstraintError`, `ForeignKeyConstraintError` or `ExclusionConstraintError`.

## API reference

- [`Model`](/api/classes/Model) — `addHook`, `removeHook`, `validate`
- [`HOOK_TYPES`](/api/variables/HOOK_TYPES), [`HookFunction`](/api/type-aliases/HookFunction)
- [`AttributeValidateOptions`](/api/type-aliases/AttributeValidateOptions), [`StandardSchemaV1`](/api/type-aliases/StandardSchemaV1)
- [`ValidationError`](/api/classes/ValidationError), [`ValidationErrorItem`](/api/classes/ValidationErrorItem)
