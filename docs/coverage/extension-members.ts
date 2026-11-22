/**
 * Methods that postgrelize adds to `Sequelize`, `Model`, `Transaction` and `QueryInterface` and that
 * Sequelize v6 lacks. Feeds the "Extensions" page; `tests/docs/extensions-page.test.ts` checks that
 * every member exists in the public API and every guide link points to a real heading.
 */
export type ExtensionMember = Readonly<{
  /** `Class.member`, as in the API reference. */
  member: string;
  /** What it does, one line. */
  summary: string;
  /** `<page>#<anchor>` in `docs/guide`. */
  guide: string;
}>;

export const EXTENSION_MEMBERS: readonly ExtensionMember[] = [
  { member: 'Model.insert', summary: 'INSERT with `onConflict`; returns every written row with `wasInserted`.', guide: 'upserts#expression-updates-and-wasinserted' },
  { member: 'Model.insertFrom', summary: '`INSERT ... SELECT` from a query, with `onConflict` and `returning`.', guide: 'bulk-writes#insert-select' },
  { member: 'Model.merge', summary: '`MERGE` with `WHEN MATCHED` / `WHEN NOT MATCHED` actions (PostgreSQL 15+, `RETURNING` 17+).', guide: 'bulk-writes#merge' },
  { member: 'Model.updateStatement', summary: '`UPDATE ... FROM`: update rows from a joined source.', guide: 'bulk-writes#update-from' },
  { member: 'Model.deleteStatement', summary: '`DELETE ... USING`: delete rows matched against another relation.', guide: 'bulk-writes#delete-using' },
  { member: 'Model.findEach', summary: 'Stream rows in batches through a server-side cursor.', guide: 'advanced-queries#server-side-cursors-with-findeach' },
  { member: 'Model.copyFrom', summary: '`COPY ... FROM STDIN`: bulk-load rows from an async iterable.', guide: 'bulk-writes#import-with-copyfrom' },
  { member: 'Model.copyTo', summary: '`COPY ... TO STDOUT`: export rows as an async iterable with backpressure.', guide: 'bulk-writes#export-with-copyto' },
  { member: 'Model.subquery', summary: 'Use a finder as a subquery expression in `where`, `attributes` or `from`.', guide: 'advanced-queries#subqueries' },
  { member: 'Sequelize.listen', summary: '`LISTEN` on a channel with a dedicated connection.', guide: 'sessions#listen-notify' },
  { member: 'Sequelize.notify', summary: '`NOTIFY` a channel (`pg_notify`) with a payload.', guide: 'sessions#listen-notify' },
  { member: 'Sequelize.withAdvisoryLock', summary: 'Run a function while holding a session-level advisory lock.', guide: 'sessions#advisory-locks' },
  { member: 'Sequelize.addModels', summary: 'Register decorated model classes.', guide: 'decorators#defining-models' },
  { member: 'Transaction.advisoryLock', summary: 'Take a transaction-level advisory lock (`pg_advisory_xact_lock`).', guide: 'sessions#advisory-locks' },
  { member: 'Transaction.tryAdvisoryLock', summary: 'Try a transaction-level advisory lock without waiting.', guide: 'sessions#advisory-locks' },
  { member: 'QueryInterface.createPartition', summary: 'Create a partition of a partitioned table.', guide: 'constraints-indexes#declarative-partitioning' },
  { member: 'QueryInterface.attachPartition', summary: 'Attach an existing table as a partition.', guide: 'constraints-indexes#declarative-partitioning' },
  { member: 'QueryInterface.detachPartition', summary: 'Detach a partition, optionally `CONCURRENTLY`.', guide: 'constraints-indexes#declarative-partitioning' },
  { member: 'QueryInterface.validateConstraint', summary: '`VALIDATE CONSTRAINT` for a constraint added `NOT VALID`.', guide: 'constraints-indexes#not-valid-and-validate-constraint' },
  { member: 'QueryInterface.createView', summary: '`CREATE VIEW`.', guide: 'schema-objects#views-and-materialized-views' },
  { member: 'QueryInterface.createMaterializedView', summary: '`CREATE MATERIALIZED VIEW`.', guide: 'schema-objects#views-and-materialized-views' },
  { member: 'QueryInterface.refreshMaterializedView', summary: '`REFRESH MATERIALIZED VIEW`, optionally `CONCURRENTLY`.', guide: 'schema-objects#views-and-materialized-views' },
  { member: 'QueryInterface.createExtension', summary: '`CREATE EXTENSION`.', guide: 'schema-objects#extensions' },
  { member: 'QueryInterface.createSequence', summary: '`CREATE SEQUENCE`.', guide: 'schema-objects#sequences' },
  { member: 'QueryInterface.setval', summary: '`setval` of a sequence.', guide: 'schema-objects#sequences' },
  { member: 'QueryInterface.nextval', summary: '`nextval` of a sequence.', guide: 'schema-objects#sequences' },
  { member: 'QueryInterface.enableRowLevelSecurity', summary: '`ENABLE ROW LEVEL SECURITY` on a table.', guide: 'schema-objects#row-level-security' },
  { member: 'QueryInterface.createPolicy', summary: '`CREATE POLICY` for row-level security.', guide: 'schema-objects#row-level-security' },
];
