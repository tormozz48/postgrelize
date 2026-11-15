# Writing data

<<< @/examples/llm-usage.ts#crud{ts}

## Hooks

<<< @/examples/llm-usage.ts#hooks{ts}

Order for `create`: `beforeValidate`, `afterValidate` (or `validationFailed`), `beforeCreate`, `afterCreate`. Bulk operations run row hooks only with `individualHooks: true`; `hooks: false` skips hooks for one call.

## Validation

<<< @/examples/hooks-validation.ts#validators{ts}

Standard Schema (zod, valibot, arktype) is supported through `validate: { schema }` and the `validationSchema` model option.

## Upserts and RETURNING

<<< @/examples/llm-usage.ts#upsert{ts}

<<< @/examples/upserts.ts#conditional{ts}

<<< @/examples/upserts.ts#targets{ts}

## UPDATE FROM, DELETE USING, INSERT FROM

<<< @/examples/bulk-writes.ts#update-from{ts}

<<< @/examples/bulk-writes.ts#insert-from{ts}

<<< @/examples/bulk-writes.ts#destroy-using{ts}

## COPY (large imports and exports)

<<< @/examples/copy.ts#copy-from{ts}

<<< @/examples/copy.ts#copy-to{ts}
