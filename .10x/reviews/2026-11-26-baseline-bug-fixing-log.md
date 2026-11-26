# v6 baseline bug fixing log (2026-11-26)

Causes of `scripts/v6-suite/baseline.json` marked `bug` (116 after 1.9.5), fixed one by one. The fix PRs are independent of each other and carry no `CHANGELOG.md` or `baseline.json` change; the changelog lines and the baseline shrink went in one PR per release group (1.9.6 to 1.9.10).

Fixed: 69. Open: 47 (includes causes found while fixing).

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

## Not fixed

| cause | risk | note |
| --- | --- | --- |
| `A-btm-identifier-props` | error | BelongsToMany lacks v6 public properties foreignIdentifier, identifier (and sourceKeyField, foreignIdentifierField). |
| `A-btm-paired-otherkey` | error | Two paired belongsToMany declaring foreignKey/sourceKey do not take otherKey from the paired association foreignKey; an extra auto-named otherKey column is generated and the real one stays NULL, so add/set fail. |
| `A-default-alias-redefine` | error | Re-declaring an association with the default alias throws "alias in two separate associations"; v6 only checks explicit aliases and silently replaces the default one. |
| `A-hasone-hasmany-cascade-default` | error | hasOne/hasMany FK with allowNull:false gets ON DELETE NO ACTION; v6 uses CASCADE (NO ACTION is only the belongsTo default); docs/guide/associations.md states the belongsTo default for all. |
| `A-references-model-object` | cosmetic | Generated FK attribute has references.model = {tableName} object, v6 has the plain table name string (getTableName()). |
| `A-references-null-crash` | error | Attribute with references:null (opt out of FK) crashes sync with "Cannot read properties of null (reading key)". |
| `B-attributes-empty` | wording | findAll({attributes:[]}) returns [] instead of throwing v6's QueryError 'Attempted a SELECT query ... without selecting any columns'. |
| `B-btm-count-through-timestamps` | error | instance.countX() on a belongsToMany with a string through selects the auto-created through model's createdAt/updatedAt, failing when the join table has no timestamp columns; v6 selects no through attributes for count. |
| `B-btm-duplicate-auto-alias` | error | Declaring two belongsToMany to the same target without `as` (different through) throws 'You have used the alias projects in two separate associations'; v6 only checks explicitly given aliases (the second overwrites the first). |
| `B-btm-paired-otherkey` | error | Two belongsToMany with the same through model and explicit foreignKey on each side are not paired: otherKey is derived from the target name (courseNo) instead of the counterpart's foreignKey (CourseId), so the through table gets extra columns and add() inserts NULL into CourseId. |
| `B-datavalues-key-order` | cosmetic | dataValues/toJSON key order differs: attributes with defaults come first ({isUser,id,username,...}) instead of definition order ({id,username,...}); JSON.stringify comparisons differ. |
| `B-deferrable-callable` | error | Deferrable.INITIALLY_IMMEDIATE() / INITIALLY_DEFERRED() (v6 allows the call form) throws 'is not a function': postgrelize exposes plain objects. |
| `B-findorcreate-pool-deadlock` | error | 50 concurrent findOrCreate calls hang forever with the default pool (max 5): each takes a pooled connection for its transaction while inner queries wait for another, exhausting the pool. v6 completes. |
| `B-index-field-attribute-key` | error | Index field objects in define({indexes:[{fields:[{attribute:'email',collate,order,length}]}]}) use v6's `attribute` key; postgrelize only reads `name`, so sync crashes with TypeError reading replaceAll of undefined. |
| `B-invalid-attr-message` | wording | An invalid attribute definition (attributes:['id',['username']]) raises a TypeError (reading 'replaceAll') instead of v6's '["username"] is not a valid attribute definition' message; in the v6 test (missing await) it becomes an unhandled rejection that aborts the whole mocha file, masking later tests. |
| `B-logging-interpolated` | cosmetic | The logging callback receives SQL with values inlined ('43'), whereas v6 logs the statement with $1..$n placeholders; code or tests that inspect the logged text for bind markers fail. |
| `B-references-null` | error | An attribute with references: null (v6 way to switch the FK off, used by polymorphic belongsToMany through models) crashes sync with TypeError reading 'key'. |
| `B-schema-clone-include` | error | Model.schema('x') clones do not carry the associations / target identity: include:[{model: Employee.schema('s1'), as:'employees'}] on Restaurant.schema('s1') fails with 'alias does not match the alias(es) defined in your association ()'. |
| `B-sync-schema-option-references` | error | Model.sync({schema}) / Model.schema(x) with an association FK: the FK references and the association setters/getters look the parent table up in the default schema ('relation UserXYZs does not exist'). |
| `B-sync-two-models-one-table` | error | Two models mapped to the same table are both synced (v6 keeps only the last one per table), so the FK to the second model's column is created against the first model's table and sync fails (edge case). |
| `B-unique-msg-option` | wording | unique: { msg } (and { name, msg }) on an attribute is ignored: UniqueConstraintError carries the default '<field> must be unique' / 'Validation error' text instead of the custom message. |
| `B-virtual-exclude` | cosmetic | findAll({attributes:{exclude:['virtualAttr']}}) still returns the VIRTUAL key (undefined) in get(); v6 omits it. |
| `C-addindex-null-options` | error | queryInterface.addIndex(table, fields, null, name) throws TypeError (options null) while v6 accepts null options. |
| `C-bind-log-inlined` | cosmetic | Logged SQL for queries with bind has values inlined ("select 1::int") instead of v6 "$1" placeholders. |
| `C-client-min-messages` | cosmetic | v6 sets client_min_messages=warning by default and supports clientMinMessages / dialectOptions.clientMinMessages (ERROR / IGNORE / false); postgrelize never issues SET client_min_messages (server default notice) and ignores the option. |
| `C-datatypes-abstract` | cosmetic | DataTypes.ABSTRACT export missing (typed in v6), so `instanceof DataTypes.ABSTRACT` throws. |
| `C-findorcreate-find-outside-tx` | cosmetic | findOrCreate runs its initial find outside the transaction (only the create is in one); v6 wraps find+create in one, so CLS/log shows the find on the default connection. |
| `C-fk-field-collision` | error | hasMany/belongsTo foreignKey equal to the column name (field) of an existing attribute creates a duplicate column in CREATE TABLE ("user_id" specified more than once); v6 merges by field. |
| `C-log-default-noop` | cosmetic | sequelize.log() is a no-op when `logging` option is not given; v6 defaults to console.log. |
| `C-logqueryparameters` | cosmetic | logQueryParameters option is not implemented: logs have no parameters suffix. |
| `C-modelmanager-all-findmodel` | cosmetic | ModelManager lacks typed v6 members `all` and `findModel`. |
| `C-no-logging-on-failed-query` | cosmetic | The query logger is not called for a statement that fails (v6 logs "Executing" before running, so retry logs each attempt). |
| `C-options-define-late` | cosmetic | Mutating sequelize.options.define (global getter/setter methods) after construction has no effect for later define(); postgrelize snapshots it. |
| `C-qi-argument-errors` | wording | Argument validation / message differences: renameColumn on missing column, addColumn with too few args, addConstraint without type, describeTable on missing table give raw PG/TypeError or different text instead of v6 messages. |
| `C-qi-function-args` | error | createFunction/dropFunction/renameFunction do not accept null or non-array optionsArray (TypeError options.map / null .schema) and validation messages differ from v6; a rejected-with TypeError in the test also crashes the mocha process via unhandled rejection. |
| `C-references-without-model-drop` | error | Attribute with references:{deferrable} but no model (filled by belongsTo) makes sync/drop throw TypeError in referencedTable. |
| `C-sequelize-instance-sequelize-prop` | cosmetic | Instance property `sequelize.Sequelize` (typed public in v6, the class) is undefined. |
| `C-sync-no-models-connection` | error | sequelize.sync({force:true}) with no models and an unreachable database resolves successfully; v6 rejects (ConnectionError). |
| `C-unknown-constraint-error` | error | removeConstraint of a non-existent constraint throws SequelizeDatabaseError; v6 throws UnknownConstraintError. |
| `C-validation-error-item-api` | cosmetic | ValidationErrorItem lacks getValidatorKey() and static Origins (typed public in v6). |
| `D-assoc-invalid-model-arg` | wording | Model.belongsTo()/hasMany()/hasOne() with no/invalid target throw 'Cannot convert undefined or null to object' instead of v6 'X.belongsTo called with something that's not a subclass of Sequelize.Model'. |
| `D-assoc-unknown-key-option` | error | hasOne/hasMany sourceKey and belongsTo targetKey naming an attribute that does not exist is accepted silently; v6 throws 'Unknown attribute "x" passed as sourceKey/targetKey, define this attribute on model "M" first'. |
| `D-config-dialectoptions-missing` | cosmetic | sequelize.config lacks dialectOptions (and options like dialectModulePath are ignored), v6 exposes config.dialectOptions. |
| `D-data-types-string-options` | error | DataTypes.STRING({length:1234}) options-object form throws 'STRING length must be a non-negative integer'; sql/data-types.test.js cannot load. |
| `D-define-tinyint-warn` | cosmetic | No console.warn when a postgres model uses TINYINT (unsupported INTEGER variant) as v6 does ('does not support TINYINT'). |
| `D-getattributes-shape` | cosmetic | getAttributes()/rawAttributes entries keep type as the un-instantiated DataTypes function (type.constructor is Function, instanceof checks fail) and lack Model/_modelAttribute fields that v6 sets. |
| `D-include-invalid-element` | cosmetic | Fixed for findAll (invalid include elements throw v6 message); the two unit tests still fail because they call v6 private Model._conformIncludes, which postgrelize does not expose. |
