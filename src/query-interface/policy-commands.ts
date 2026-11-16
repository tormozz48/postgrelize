import {
  PolicyDdl,
  type AlterPolicyOptions,
  type CreatePolicyOptions,
  type DisableRowLevelSecurityOptions,
  type DropPolicyOptions,
  type EnableRowLevelSecurityOptions,
} from '../ddl/policy-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { StatementRunner } from './statement-runner.ts';

const policies = new PolicyDdl();

/**
 * Row-level security DDL of `QueryInterface`. Names are quoted; string conditions are trusted SQL.
 *
 * @internal
 */
export class PolicyCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Runs `ENABLE ROW LEVEL SECURITY`.
   *
   * @param table - Table.
   * @param options - Statement and query options.
   */
  async enable(
    table: TableName,
    options: EnableRowLevelSecurityOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(policies.enableSql(table, options), options);
  }

  /**
   * Runs `DISABLE ROW LEVEL SECURITY`.
   *
   * @param table - Table.
   * @param options - Statement and query options.
   */
  async disable(
    table: TableName,
    options: DisableRowLevelSecurityOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(policies.disableSql(table, options), options);
  }

  /**
   * Runs `CREATE POLICY`.
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Policy and query options.
   */
  async create(
    table: TableName,
    name: string,
    options: CreatePolicyOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(policies.createSql(table, name, options), options);
  }

  /**
   * Runs `ALTER POLICY`.
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Changes and query options.
   */
  async alter(
    table: TableName,
    name: string,
    options: AlterPolicyOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.runAll(policies.alterSql(table, name, options), options);
  }

  /**
   * Runs `DROP POLICY`.
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Statement and query options.
   */
  async drop(
    table: TableName,
    name: string,
    options: DropPolicyOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(policies.dropSql(table, name, options), options);
  }
}
