import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const sqlLiteral = new SqlLiteral();

const identity = new WhereCompiler({ resolve: (field) => ({ field }) });

const COMMANDS: Readonly<Record<string, string>> = {
  all: 'ALL',
  select: 'SELECT',
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
};

const KINDS: Readonly<Record<string, string>> = {
  permissive: 'PERMISSIVE',
  restrictive: 'RESTRICTIVE',
};

const ROLE_KEYWORDS: Readonly<Record<string, string>> = {
  public: 'PUBLIC',
  current_user: 'CURRENT_USER',
  current_role: 'CURRENT_ROLE',
  session_user: 'SESSION_USER',
};

/** Condition of a policy: SQL text (trusted) or a where object (values rendered as literals). */
export type PolicyCondition = string | Readonly<Record<string | symbol, unknown>>;

/**
 * Options of `enableRowLevelSecurity`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: EnableRowLevelSecurityOptions = { force: true };
 * await queryInterface.enableRowLevelSecurity('documents', options);
 * ```
 */
export type EnableRowLevelSecurityOptions = Readonly<{
  /** Also `FORCE ROW LEVEL SECURITY`: the table owner is subject to the policies too. */
  force?: boolean;
}>;

/**
 * Options of `disableRowLevelSecurity`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: DisableRowLevelSecurityOptions = { noForce: true };
 * await queryInterface.disableRowLevelSecurity('documents', options);
 * ```
 */
export type DisableRowLevelSecurityOptions = Readonly<{
  /** Also `NO FORCE ROW LEVEL SECURITY`. */
  noForce?: boolean;
}>;

/**
 * Options of `createPolicy`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: CreatePolicyOptions = {
 *   command: 'select',
 *   roles: ['app_user'],
 *   using: "tenant_id = current_setting('app.tenant_id')::int",
 * };
 * await queryInterface.createPolicy('documents', 'tenant_isolation', options);
 * ```
 */
export type CreatePolicyOptions = Readonly<{
  /** Command the policy applies to; defaults to `'all'`. */
  command?: 'all' | 'select' | 'insert' | 'update' | 'delete';
  /** `'permissive'` (default) or `'restrictive'`. */
  kind?: 'permissive' | 'restrictive';
  /** Roles the policy applies to: role names, or `'public'`, `'current_user'`, `'current_role'`, `'session_user'`. */
  roles?: readonly string[];
  /** `USING (...)`: which existing rows are visible. SQL text is trusted; a where object is compiled with literals. */
  using?: PolicyCondition;
  /** `WITH CHECK (...)`: which new rows may be written. Same forms as `using`. */
  withCheck?: PolicyCondition;
}>;

/**
 * Options of `alterPolicy`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: AlterPolicyOptions = { roles: ['app_user', 'app_admin'], rename: 'tenant_rows' };
 * await queryInterface.alterPolicy('documents', 'tenant_isolation', options);
 * ```
 */
export type AlterPolicyOptions = Readonly<
  Pick<CreatePolicyOptions, 'roles' | 'using' | 'withCheck'> & {
    /** New policy name (applied after the other changes). */
    rename?: string;
  }
>;

/**
 * Options of `dropPolicy`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: DropPolicyOptions = { ifExists: true };
 * await queryInterface.dropPolicy('documents', 'tenant_isolation', options);
 * ```
 */
export type DropPolicyOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** Also drops objects that depend on the policy. */
  cascade?: boolean;
}>;

const lookup = (map: Readonly<Record<string, string>>, key: string, kind: string): string => {
  const value =
    typeof key === 'string' && Object.hasOwn(map, key.toLowerCase())
      ? map[key.toLowerCase()]
      : undefined;
  if (value === undefined) {
    throw new Error(`Invalid policy ${kind}: ${String(key)}`);
  }
  return value;
};

/**
 * Row-level security DDL: `ENABLE` / `DISABLE ROW LEVEL SECURITY` and `CREATE` / `ALTER` / `DROP
 * POLICY`. Names and roles are quoted; commands and kinds are allowlisted; string conditions are
 * trusted SQL (ADR-025).
 *
 * @internal
 */
export class PolicyDdl {
  /**
   * `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement.
   *
   * @param table - Table.
   * @param options - Statement options.
   * @returns Statement.
   */
  enableSql(table: TableName, options: EnableRowLevelSecurityOptions): string {
    return `ALTER TABLE ${sqlLiteral.quoteTable(table)} ENABLE ROW LEVEL SECURITY${options.force === true ? ', FORCE ROW LEVEL SECURITY' : ''}`;
  }

  /**
   * `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` statement.
   *
   * @param table - Table.
   * @param options - Statement options.
   * @returns Statement.
   */
  disableSql(table: TableName, options: DisableRowLevelSecurityOptions): string {
    return `ALTER TABLE ${sqlLiteral.quoteTable(table)} DISABLE ROW LEVEL SECURITY${options.noForce === true ? ', NO FORCE ROW LEVEL SECURITY' : ''}`;
  }

  /**
   * `CREATE POLICY` statement.
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Policy options.
   * @returns Statement.
   * @throws Error for an unknown command or kind.
   */
  createSql(table: TableName, name: string, options: CreatePolicyOptions): string {
    return [
      `CREATE POLICY ${SqlCompiler.quoteIdent(name)} ON ${sqlLiteral.quoteTable(table)}`,
      options.kind === undefined ? '' : ` AS ${lookup(KINDS, options.kind, 'kind')}`,
      options.command === undefined ? '' : ` FOR ${lookup(COMMANDS, options.command, 'command')}`,
      this.#tail(options),
    ].join('');
  }

  /**
   * `ALTER POLICY` statements (the change, then the rename).
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Changes.
   * @returns Statements.
   * @throws Error without any change.
   */
  alterSql(table: TableName, name: string, options: AlterPolicyOptions): readonly string[] {
    const on = `${SqlCompiler.quoteIdent(name)} ON ${sqlLiteral.quoteTable(table)}`;
    const change = this.#tail(options);
    const statements = [
      ...(change === '' ? [] : [`ALTER POLICY ${on}${change}`]),
      ...(options.rename === undefined
        ? []
        : [`ALTER POLICY ${on} RENAME TO ${SqlCompiler.quoteIdent(options.rename)}`]),
    ];
    if (statements.length === 0) {
      throw new Error('alterPolicy requires at least one option');
    }
    return statements;
  }

  /**
   * `DROP POLICY` statement.
   *
   * @param table - Table.
   * @param name - Policy name.
   * @param options - Statement options.
   * @returns Statement.
   */
  dropSql(table: TableName, name: string, options: DropPolicyOptions): string {
    return `DROP POLICY ${options.ifExists === true ? 'IF EXISTS ' : ''}${SqlCompiler.quoteIdent(name)} ON ${sqlLiteral.quoteTable(table)}${options.cascade === true ? ' CASCADE' : ''}`;
  }

  #tail(options: Pick<CreatePolicyOptions, 'roles' | 'using' | 'withCheck'>): string {
    return [
      this.#roles(options.roles),
      options.using === undefined ? '' : ` USING (${this.#condition(options.using)})`,
      options.withCheck === undefined ? '' : ` WITH CHECK (${this.#condition(options.withCheck)})`,
    ].join('');
  }

  #roles(roles: readonly string[] | undefined): string {
    if (roles === undefined) {
      return '';
    }
    if (roles.length === 0) {
      throw new Error('Policy roles must not be empty');
    }
    const names = roles.map(
      (role) => ROLE_KEYWORDS[role.toLowerCase()] ?? SqlCompiler.quoteIdent(role),
    );
    return ` TO ${names.join(', ')}`;
  }

  #condition(condition: PolicyCondition): string {
    if (typeof condition === 'string') {
      if (condition.trim() === '') {
        throw new Error('A policy condition must not be empty');
      }
      return condition;
    }
    return sqlLiteral.inlineExpr(identity.compile(condition));
  }
}
