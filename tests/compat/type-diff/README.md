# Declaration diff against Sequelize v6

`tests/compat/type-diff.test.ts` reads the exported declarations of `sequelize@6` (`node_modules/sequelize/types`) and of postgrelize
(`src/index.ts`) with the TypeScript compiler API (`tests/support/type-diff.ts`) and compares every name that both export:

- **member**: a property or method of a class or interface (`Type.member`, `Type.static member` for class statics) that v6 has and we lack;
- **arity**: a method that takes fewer parameters (and no rest parameter) or requires more parameters than in v6;
- **generic**: a different number of type parameters, or a different set of parameters with defaults (names are ignored);
- **kind**: a class that became a type, an enum that became a type, a namespace that became a value. `interface` to `type`,
  `function` to `const` and `enum` to `const` are source-compatible and ignored.

Left out on purpose: symbol-keyed and underscore members (internals), the `Validator` interface (a copy of validator.js's API, listed in
`skipTypes`), and names that only v6 exports (`type-parity.test.ts`). Parameter and member _types_ are not compared here; the compiled
corpora (`type-parity`, `v6-types`) cover them.

`exceptions.json` maps each remaining difference to a cause (`category`: `tracked` is a gap to fix, `not-planned`, `other-dialect`,
`internal`; plus a note). It can only shrink: a new difference fails the test, and so does a fixed one until its entry is deleted. Lower
`MAX_DIFFERENCES` when entries leave.
