import type {
  AlterPolicyOptions,
  CreatePolicyOptions,
  DisableRowLevelSecurityOptions,
  DropPolicyOptions,
  EnableRowLevelSecurityOptions,
} from '../ddl/policy-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { PolicyCommands } from './policy-commands.ts';
import { QueryInterfaceViews } from './query-interface-views.ts';
import { StatementRunner } from './statement-runner.ts';

/**
 * Row-level security part of {@link QueryInterface}.
 */
export class QueryInterfacePolicies extends QueryInterfaceViews {
  readonly #policies: PolicyCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#policies = new PolicyCommands(new StatementRunner(sequelize));
  }

  /**
   * Turns on row-level security for a table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Without policies, non-owners see no rows.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `force` (also applies to the table owner) and query options.
   *
   * @example
   * ```ts
   * await queryInterface.enableRowLevelSecurity('documents', { force: true });
   * ```
   * @see [Schema objects guide](/guide/schema-objects)
   */
  async enableRowLevelSecurity(
    table: TableName,
    options: EnableRowLevelSecurityOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#policies.enable(table, options);
  }

  /**
   * Turns off row-level security for a table (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`); policies are kept.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - `noForce` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.disableRowLevelSecurity('documents', { noForce: true });
   * ```
   */
  async disableRowLevelSecurity(
    table: TableName,
    options: DisableRowLevelSecurityOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#policies.disable(table, options);
  }

  /**
   * Creates a row-level security policy with `CREATE POLICY`.
   *
   * `using` and `withCheck` are SQL text you provide (not escaped, never build them from user input) or a where object, whose values are rendered as escaped literals. Session variables set with the `settings` transaction option work in conditions: `"tenant_id = current_setting('app.tenant_id')::int"`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Policy name.
   * @param options - `command`, `kind`, `roles`, `using`, `withCheck` and query options.
   * @throws Error for an unknown `command` or `kind`, empty `roles` or an empty condition.
   *
   * @example
   * ```ts
   * await queryInterface.createPolicy('documents', 'tenant_isolation', {
   *   roles: ['app_user'],
   *   using: "tenant_id = current_setting('app.tenant_id')::int",
   *   withCheck: "tenant_id = current_setting('app.tenant_id')::int",
   * });
   * ```
   */
  async createPolicy(
    table: TableName,
    name: string,
    options: CreatePolicyOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#policies.create(table, name, options);
  }

  /**
   * Changes a policy with `ALTER POLICY`: roles, conditions and name (`rename`, applied last).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Current policy name.
   * @param options - Changes (at least one) and query options.
   * @throws Error when no change is given.
   *
   * @example
   * ```ts
   * await queryInterface.alterPolicy('documents', 'tenant_isolation', { roles: ['app_user', 'app_admin'] });
   * ```
   */
  async alterPolicy(
    table: TableName,
    name: string,
    options: AlterPolicyOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#policies.alter(table, name, options);
  }

  /**
   * Drops a policy with `DROP POLICY`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Policy name.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropPolicy('documents', 'tenant_isolation', { ifExists: true });
   * ```
   */
  async dropPolicy(
    table: TableName,
    name: string,
    options: DropPolicyOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#policies.drop(table, name, options);
  }
}
