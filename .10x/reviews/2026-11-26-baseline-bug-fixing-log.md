# v6 baseline bug fixing log (2026-11-26)

Causes of `scripts/v6-suite/baseline.json` marked `bug` (116 after 1.9.5), fixed one by one. The fix PRs are independent of each other and carry no `CHANGELOG.md` or `baseline.json` change; this log, the changelog lines and the baseline shrink are in one bookkeeping PR that is merged last.

Fixed: 42. Open: 74.

## Fixed (in an open PR)

| cause | risk | PR |
| --- | --- | --- |
| `A-association-get-limit` | wrong-result | [#198](https://github.com/tormozz48/postgrelize/pull/198) |
| `A-getter-scope-option` | wrong-result | [#198](https://github.com/tormozz48/postgrelize/pull/198) |
| `A-datatype-instanceof` | wrong-result | [#199](https://github.com/tormozz48/postgrelize/pull/199) |
| `A-fk-existing-attribute-not-merged` | wrong-result | [#199](https://github.com/tormozz48/postgrelize/pull/199) |
| `B-getter-setter-methods` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `B-instance-set-include` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `B-rejectOnEmpty-findall` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `B-set-readonly-pk-timestamps` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `D-json-nested-set` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `D-set-date-string-null` | wrong-result | [#200](https://github.com/tormozz48/postgrelize/pull/200) |
| `D-rawattributes-copy` | wrong-result | [#203](https://github.com/tormozz48/postgrelize/pull/203) |
| `B-json-date-where` | wrong-result | [#205](https://github.com/tormozz48/postgrelize/pull/205) |
| `C-typevalidation-option` | wording | [#205](https://github.com/tormozz48/postgrelize/pull/205) |
| `D-typevalidation-ignored` | wrong-result | [#205](https://github.com/tormozz48/postgrelize/pull/205) |
| `B-increment-instance` | wrong-result | [#206](https://github.com/tormozz48/postgrelize/pull/206) |
| `B-increment-version` | wrong-result | [#207](https://github.com/tormozz48/postgrelize/pull/207) |
| `B-json-key-cast` | wrong-result | [#208](https://github.com/tormozz48/postgrelize/pull/208) |
| `B-json-path-index` | wrong-result | [#209](https://github.com/tormozz48/postgrelize/pull/209) |
| `A-btm-add-existing-no-update` | wrong-result | [#213](https://github.com/tormozz48/postgrelize/pull/213) |
| `A-op-not-array` | wrong-result | [#214](https://github.com/tormozz48/postgrelize/pull/214) |
| `A-hasmany-write-applies-default-scope` | wrong-result | [#215](https://github.com/tormozz48/postgrelize/pull/215) |
| `A-btm-timestamps-option` | wrong-result | [#216](https://github.com/tormozz48/postgrelize/pull/216) |
| `A-include-merge-same-model` | error | [#217](https://github.com/tormozz48/postgrelize/pull/217) |
| `A-scope-include-replaced` | wrong-result | [#217](https://github.com/tormozz48/postgrelize/pull/217) |
| `B-hook-changes-not-revalidated` | wrong-result | [#218](https://github.com/tormozz48/postgrelize/pull/218) |
| `B-update-saves-all-changed` | wrong-result | [#219](https://github.com/tormozz48/postgrelize/pull/219) |
| `B-updatedat-default` | wrong-result | [#220](https://github.com/tormozz48/postgrelize/pull/220) |
| `B-literal-default-not-returned` | wrong-result | [#221](https://github.com/tormozz48/postgrelize/pull/221) |
| `B-upsert-named-unique-index` | wrong-result | [#224](https://github.com/tormozz48/postgrelize/pull/224) |
| `D-index-options-ignored` | wrong-result | [#224](https://github.com/tormozz48/postgrelize/pull/224) |
| `C-bind-dollar-escape` | wrong-result | [#225](https://github.com/tormozz48/postgrelize/pull/225) |
| `C-query-fieldmap` | wrong-result | [#226](https://github.com/tormozz48/postgrelize/pull/226) |
| `C-raw-show-result-shape` | wrong-result | [#226](https://github.com/tormozz48/postgrelize/pull/226) |
| `C-uri-query-options` | wrong-result | [#228](https://github.com/tormozz48/postgrelize/pull/228) |
| `D-define-hooks-merge` | wrong-result | [#229](https://github.com/tormozz48/postgrelize/pull/229) |
| `D-remove-attribute-pk` | wrong-result | [#230](https://github.com/tormozz48/postgrelize/pull/230) |
| `B-describetable-schema-arg` | error | [#232](https://github.com/tormozz48/postgrelize/pull/232) |
| `C-createtable-schema-option` | wrong-result | [#232](https://github.com/tormozz48/postgrelize/pull/232) |
| `C-createtable-uniquekeys` | wrong-result | [#232](https://github.com/tormozz48/postgrelize/pull/232) |
| `C-fk-references-fields` | wrong-result | [#232](https://github.com/tormozz48/postgrelize/pull/232) |
| `C-fk-default-constraint-name` | wrong-result | [#234](https://github.com/tormozz48/postgrelize/pull/234) |
| `C-changecolumn-references` | wrong-result | [#236](https://github.com/tormozz48/postgrelize/pull/236) |

## Not fixed

| cause | risk | status |
| --- | --- | --- |
| `A-aggregate-ignores-include` | wrong-result | stopped: written and locally committed (branch `fix/aggregate-ignores-include`), not verified, not pushed |
| `A-btm-identifier-props` | error | not started: work stopped on request to rework the PRs |
| `A-btm-paired-otherkey` | error | not started: work stopped on request to rework the PRs |
| `A-date-number` | error | not started: work stopped on request to rework the PRs |
| `A-default-alias-redefine` | error | not started: work stopped on request to rework the PRs |
| `A-group-nested-array` | error | not started: work stopped on request to rework the PRs |
| `A-hasone-hasmany-cascade-default` | error | not started: work stopped on request to rework the PRs |
| `A-instance-rawattributes` | error | not started: work stopped on request to rework the PRs |
| `A-primarykeyfield-missing` | error | not started: work stopped on request to rework the PRs |
| `A-references-model-object` | cosmetic | not started: work stopped on request to rework the PRs |
| `A-references-null-crash` | error | not started: work stopped on request to rework the PRs |
| `A-scope-fn-by-name` | error | not started: work stopped on request to rework the PRs |
| `A-subquery-join-field-name` | error | not started: work stopped on request to rework the PRs |
| `A-update-no-options` | error | not started: work stopped on request to rework the PRs |
| `B-aggregate-alias-group` | error | not started: work stopped on request to rework the PRs |
| `B-attributes-empty` | wording | not started: work stopped on request to rework the PRs |
| `B-belongsto-include-notnull-fk` | error | not started: work stopped on request to rework the PRs |
| `B-btm-count-through-timestamps` | error | not started: work stopped on request to rework the PRs |
| `B-btm-duplicate-auto-alias` | error | not started: work stopped on request to rework the PRs |
| `B-btm-paired-otherkey` | error | not started: work stopped on request to rework the PRs |
| `B-datavalues-key-order` | cosmetic | not started: work stopped on request to rework the PRs |
| `B-date-number-bound-bigint` | error | not started: work stopped on request to rework the PRs |
| `B-deferrable-callable` | error | not started: work stopped on request to rework the PRs |
| `B-define-time-validation` | error | not started: work stopped on request to rework the PRs |
| `B-findorcreate-pool-deadlock` | error | not started: work stopped on request to rework the PRs |
| `B-include-attr-bare-literal` | error | not started: work stopped on request to rework the PRs |
| `B-index-field-attribute-key` | error | not started: work stopped on request to rework the PRs |
| `B-invalid-attr-message` | wording | not started: work stopped on request to rework the PRs |
| `B-logging-interpolated` | cosmetic | not started: work stopped on request to rework the PRs |
| `B-references-null` | error | not started: work stopped on request to rework the PRs |
| `B-schema-clone-include` | error | not started: work stopped on request to rework the PRs |
| `B-sync-schema-option-references` | error | not started: work stopped on request to rework the PRs |
| `B-sync-two-models-one-table` | error | not started: work stopped on request to rework the PRs |
| `B-unique-msg-option` | wording | not started: work stopped on request to rework the PRs |
| `B-update-no-args` | wording | not started: work stopped on request to rework the PRs |
| `B-update-undefined-values` | error | not started: work stopped on request to rework the PRs |
| `B-update-unknown-fields` | error | not started: work stopped on request to rework the PRs |
| `B-validator-extend` | error | not started: work stopped on request to rework the PRs |
| `B-virtual-exclude` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-addindex-null-options` | error | not started: work stopped on request to rework the PRs |
| `C-array-no-type` | error | not started: work stopped on request to rework the PRs |
| `C-bind-dollar-in-identifier` | error | not started: work stopped on request to rework the PRs |
| `C-bind-log-inlined` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-client-min-messages` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-database-error-sql-params` | wording | not started: work stopped on request to rework the PRs |
| `C-datatypes-abstract` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-findorcreate-find-outside-tx` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-fk-field-collision` | error | not started: work stopped on request to rework the PRs |
| `C-log-default-noop` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-logqueryparameters` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-modelmanager-all-findmodel` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-nested-array-replacements` | error | not started: work stopped on request to rework the PRs |
| `C-no-logging-on-failed-query` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-options-define-late` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-pool-no-evict-dead-connection` | error | not started: work stopped on request to rework the PRs |
| `C-qi-argument-errors` | wording | not started: work stopped on request to rework the PRs |
| `C-qi-function-args` | error | not started: work stopped on request to rework the PRs |
| `C-references-without-model-drop` | error | not started: work stopped on request to rework the PRs |
| `C-sequelize-instance-sequelize-prop` | cosmetic | not started: work stopped on request to rework the PRs |
| `C-sync-no-models-connection` | error | not started: work stopped on request to rework the PRs |
| `C-unknown-constraint-error` | error | not started: work stopped on request to rework the PRs |
| `C-validation-error-item-api` | cosmetic | not started: work stopped on request to rework the PRs |
| `D-aggregate-error-message` | wording | not started: work stopped on request to rework the PRs |
| `D-assoc-invalid-model-arg` | wording | not started: work stopped on request to rework the PRs |
| `D-assoc-unknown-key-option` | error | not started: work stopped on request to rework the PRs |
| `D-attr-named-set` | error | not started: work stopped on request to rework the PRs |
| `D-config-dialectoptions-missing` | cosmetic | not started: work stopped on request to rework the PRs |
| `D-data-types-string-options` | error | not started: work stopped on request to rework the PRs |
| `D-define-no-validation` | wording | not started: work stopped on request to rework the PRs |
| `D-define-tinyint-warn` | cosmetic | not started: work stopped on request to rework the PRs |
| `D-define-unique-null` | error | not started: work stopped on request to rework the PRs |
| `D-error-ctor-no-args` | error | not started: work stopped on request to rework the PRs |
| `D-getattributes-shape` | cosmetic | not started: work stopped on request to rework the PRs |
| `D-include-invalid-element` | cosmetic | not started: work stopped on request to rework the PRs |
