# v6 `test/types` gate

`corpus/` is a verbatim copy of `test/types` from [sequelize v6.37.8](https://github.com/sequelize/sequelize/tree/v6.37.8/test/types)
(commit `cb7f99ad05de56137672ab95586359ff6ceba004`, MIT, see `LICENSE`). Do not edit it; to move to a newer 6.x release, replace the folder
and the pinned version in `package.json`, then fix the allow-list.

`tests/compat/v6-types.test.ts` type-checks the corpus twice:

- against the v6 declarations (`node_modules/sequelize/types`): must give 0 errors, otherwise the baseline broke;
- against postgrelize (`src/index.ts`): the errors must equal `exceptions.json`.

`exceptions.json` can only shrink. An entry is `file`, TypeScript error `code`, the first 120 characters of the `message`, how many times it occurs
(`count`) and a `cause`. Each cause has a `category` (`tracked`: a gap to fix, `not-planned`, `other-dialect`, `internal`) and a note.
When a gap is fixed the test fails until its entries are deleted; a new error fails it until the gap is fixed (or, for a deliberate divergence,
listed with a cause and a note). Lower `MAX_ERRORS` in the test when entries leave.

`expect-type` is pinned to 0.12 (`expect-type-v6`, the version v6 used): newer versions report spurious errors on the v6 side.
