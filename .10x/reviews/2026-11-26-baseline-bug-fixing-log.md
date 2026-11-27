# v6 baseline bug fixing log (2026-11-26)

Causes of `scripts/v6-suite/baseline.json` marked `bug` (116 after 1.9.5), fixed one by one. The fix PRs are independent of each other and carry no `CHANGELOG.md` or `baseline.json` change; the changelog lines and the baseline shrink went in one PR per release group (1.9.6 to 1.9.10, 1.9.12 to 1.9.16, 1.9.18 to 1.9.21).

Fixed: 118. Open: 8 (includes causes found while fixing).

## Fixed

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
| `A-date-number` | error | earlier release |
| `B-date-number-bound-bigint` | error | earlier release |
| `B-validator-extend` | error | [#253](https://github.com/tormozz48/postgrelize/pull/253) |
| `A-scope-fn-by-name` | error | [#258](https://github.com/tormozz48/postgrelize/pull/258) |
| `A-subquery-join-field-name` | error | earlier release |
| `B-include-attr-bare-literal` | error | earlier release |
| `B-belongsto-include-notnull-fk` | error | [#274](https://github.com/tormozz48/postgrelize/pull/274) |
| `A-aggregate-ignores-include` | wrong-result | [#250](https://github.com/tormozz48/postgrelize/pull/250) |
| `A-update-no-options` | error | [#251](https://github.com/tormozz48/postgrelize/pull/251) |
| `B-update-no-args` | wording | [#251](https://github.com/tormozz48/postgrelize/pull/251) |
| `B-update-undefined-values` | error | [#251](https://github.com/tormozz48/postgrelize/pull/251) |
| `B-update-unknown-fields` | error | [#251](https://github.com/tormozz48/postgrelize/pull/251) |
| `A-primarykeyfield-missing` | error | [#252](https://github.com/tormozz48/postgrelize/pull/252) |
| `A-instance-rawattributes` | error | [#252](https://github.com/tormozz48/postgrelize/pull/252) |
| `D-error-ctor-no-args` | error | [#255](https://github.com/tormozz48/postgrelize/pull/255) |
| `C-database-error-sql-params` | wording | [#255](https://github.com/tormozz48/postgrelize/pull/255) |
| `D-aggregate-error-message` | wording | [#255](https://github.com/tormozz48/postgrelize/pull/255) |
| `D-define-unique-null` | error | [#256](https://github.com/tormozz48/postgrelize/pull/256) |
| `C-array-no-type` | error | [#256](https://github.com/tormozz48/postgrelize/pull/256) |
| `B-define-time-validation` | error | [#256](https://github.com/tormozz48/postgrelize/pull/256) |
| `D-define-no-validation` | wording | [#256](https://github.com/tormozz48/postgrelize/pull/256) |
| `D-attr-named-set` | error | [#269](https://github.com/tormozz48/postgrelize/pull/269) |
| `A-group-nested-array` | error | [#260](https://github.com/tormozz48/postgrelize/pull/260) |
| `C-bind-dollar-in-identifier` | error | [#267](https://github.com/tormozz48/postgrelize/pull/267) |
| `C-nested-array-replacements` | error | [#267](https://github.com/tormozz48/postgrelize/pull/267) |
| `B-aggregate-alias-group` | error | [#273](https://github.com/tormozz48/postgrelize/pull/273) |
| `C-pool-no-evict-dead-connection` | error | [#276](https://github.com/tormozz48/postgrelize/pull/276) |
| `B-deferrable-callable` | error | [#254](https://github.com/tormozz48/postgrelize/pull/254) |
| `C-addindex-null-options` | error | [#259](https://github.com/tormozz48/postgrelize/pull/259) |
| `C-sync-no-models-connection` | error | [#259](https://github.com/tormozz48/postgrelize/pull/259) |
| `B-index-field-attribute-key` | error | [#264](https://github.com/tormozz48/postgrelize/pull/264) |
| `C-unknown-constraint-error` | error | [#265](https://github.com/tormozz48/postgrelize/pull/265) |
| `C-references-without-model-drop` | error | [#266](https://github.com/tormozz48/postgrelize/pull/266) |
| `C-fk-field-collision` | error | [#268](https://github.com/tormozz48/postgrelize/pull/268) |
| `C-qi-function-args` | error | [#271](https://github.com/tormozz48/postgrelize/pull/271) |
| `B-sync-two-models-one-table` | error | [#275](https://github.com/tormozz48/postgrelize/pull/275) |
| `A-btm-paired-otherkey` | error | [#257](https://github.com/tormozz48/postgrelize/pull/257) |
| `B-btm-paired-otherkey` | error | [#257](https://github.com/tormozz48/postgrelize/pull/257) |
| `A-btm-identifier-props` | error | [#257](https://github.com/tormozz48/postgrelize/pull/257) |
| `A-references-null-crash` | error | [#257](https://github.com/tormozz48/postgrelize/pull/257) |
| `B-references-null` | error | [#257](https://github.com/tormozz48/postgrelize/pull/257) |
| `D-assoc-invalid-model-arg` | wording | [#261](https://github.com/tormozz48/postgrelize/pull/261) |
| `D-assoc-unknown-key-option` | error | [#261](https://github.com/tormozz48/postgrelize/pull/261) |
| `A-default-alias-redefine` | error | [#262](https://github.com/tormozz48/postgrelize/pull/262) |
| `B-btm-duplicate-auto-alias` | error | [#262](https://github.com/tormozz48/postgrelize/pull/262) |
| `A-hasone-hasmany-cascade-default` | error | [#263](https://github.com/tormozz48/postgrelize/pull/263) |
| `B-btm-count-through-timestamps` | error | [#272](https://github.com/tormozz48/postgrelize/pull/272) |
| `B-findorcreate-pool-deadlock` | error | [#297](https://github.com/tormozz48/postgrelize/pull/297) |
| `C-findorcreate-find-outside-tx` | cosmetic | [#297](https://github.com/tormozz48/postgrelize/pull/297) |
| `C-sequelize-instance-sequelize-prop` | cosmetic | [#307](https://github.com/tormozz48/postgrelize/pull/307) |
| `C-modelmanager-all-findmodel` | cosmetic | [#307](https://github.com/tormozz48/postgrelize/pull/307) |
| `C-validation-error-item-api` | cosmetic | [#307](https://github.com/tormozz48/postgrelize/pull/307) |
| `D-config-dialectoptions-missing` | cosmetic | [#307](https://github.com/tormozz48/postgrelize/pull/307) |
| `C-btm-polymorphic-through-pk` | error | [#309](https://github.com/tormozz48/postgrelize/pull/309) |
| `C-raw-errors-option` | error | [#302](https://github.com/tormozz48/postgrelize/pull/302) |
| `B-attributes-empty` | wording | [#306](https://github.com/tormozz48/postgrelize/pull/306) |
| `B-invalid-attr-message` | wording | [#306](https://github.com/tormozz48/postgrelize/pull/306) |
| `B-unique-msg-option` | wording | [#305](https://github.com/tormozz48/postgrelize/pull/305) |
| `D-data-types-string-options` | error | [#299](https://github.com/tormozz48/postgrelize/pull/299) |
| `B-sync-schema-option-references` | error | [#300](https://github.com/tormozz48/postgrelize/pull/300) |
| `B-alter-deferrable-not-updated` | error | [#301](https://github.com/tormozz48/postgrelize/pull/301) |
| `D-addindex-expression-fields` | error | [#303](https://github.com/tormozz48/postgrelize/pull/303) |
| `D-unique-msg-composite` | cosmetic | [#313](https://github.com/tormozz48/postgrelize/pull/313) |
| `D-validator-key-empty` | cosmetic | [#327](https://github.com/tormozz48/postgrelize/pull/327) |
| `C-findorcreate-shared-tx` | error | [#330](https://github.com/tormozz48/postgrelize/pull/330) |
| `C-client-min-messages` | cosmetic | [#335](https://github.com/tormozz48/postgrelize/pull/335) |
| `D-findbypk-out-of-range` | error | [#329](https://github.com/tormozz48/postgrelize/pull/329) |
| `B-logging-interpolated` | cosmetic | [#333](https://github.com/tormozz48/postgrelize/pull/333) |
| `C-bind-log-inlined` | cosmetic | [#333](https://github.com/tormozz48/postgrelize/pull/333) |
| `C-logqueryparameters` | cosmetic | [#333](https://github.com/tormozz48/postgrelize/pull/333) |
| `C-no-logging-on-failed-query` | cosmetic | [#333](https://github.com/tormozz48/postgrelize/pull/333) |
| `C-log-default-noop` | cosmetic | [#333](https://github.com/tormozz48/postgrelize/pull/333) |
| `B-virtual-exclude` | cosmetic | [#334](https://github.com/tormozz48/postgrelize/pull/334) |
| `D-dateonly-infinity-default` | error | [#328](https://github.com/tormozz48/postgrelize/pull/328) |
| `B-schema-clone-include` | error | [#331](https://github.com/tormozz48/postgrelize/pull/331) |
| `C-qi-argument-errors` | wording | [#332](https://github.com/tormozz48/postgrelize/pull/332) |

## Not fixed

| cause | risk | note |
| --- | --- | --- |
| `A-references-model-object` | cosmetic | Generated FK attribute has references.model = {tableName} object, v6 has the plain table name string (getTableName()). |
| `B-datavalues-key-order` | cosmetic | dataValues/toJSON key order differs: attributes with defaults come first ({isUser,id,username,...}) instead of definition order ({id,username,...}); JSON.stringify comparisons differ. |
| `C-datatypes-abstract` | cosmetic | DataTypes.ABSTRACT export missing (typed in v6), so `instanceof DataTypes.ABSTRACT` throws. |
| `C-options-define-late` | cosmetic | Mutating sequelize.options.define (global getter/setter methods) after construction has no effect for later define(); postgrelize snapshots it. |
| `D-define-tinyint-warn` | cosmetic | No console.warn when a postgres model uses TINYINT (unsupported INTEGER variant) as v6 does ('does not support TINYINT'). |
| `D-getattributes-shape` | cosmetic | getAttributes()/rawAttributes entries keep type as the un-instantiated DataTypes function (type.constructor is Function, instanceof checks fail) and lack Model/_modelAttribute fields that v6 sets. |
| `D-btm-getter-two-queries` | cosmetic | belongsToMany getter runs two queries (junction, then target) where v6 runs one join, so SQL seen by logging differs |
| `D-grouped-limit-option` | wrong-result | The undocumented v6 findAll option groupedLimit is not supported and is ignored; these tests were not reached before. |
