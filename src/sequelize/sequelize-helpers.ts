import validatorJs from 'validator';
import { Association } from '../associations/association.ts';
import { SqlLiteral } from '../ddl/sql-literal.ts';
import { and, or } from '../expressions/logic.ts';
import { fn, type Fn } from '../expressions/methods.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import { QueryTypes } from '../query/query-result-shaper.ts';
import type { QueryInterface } from '../query-interface/query-interface.ts';
import type { SequelizeBase } from './sequelize-base.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const literals = new SqlLiteral();

/**
 * Small Sequelize v6 instance members: `queryInterface`, `random`, `escape`, `validate`, `log`,
 * `getDatabaseName`, `refreshTypes` and the `and` / `or` / `QueryTypes` / `Association` / `Validator` aliases.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeHelpers = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class HelpersCapability extends Base {
    /** Result shapes of `query`, alias of {@link QueryTypes}. */
    readonly QueryTypes = QueryTypes;
    /** Base class of the association classes. */
    readonly Association = Association;
    /** The `validator` library used by the built-in validators. */
    readonly Validator = validatorJs;
    /** Combines conditions with `AND`. */
    readonly and = and;
    /** Combines conditions with `OR`. */
    readonly or = or;

    /**
     * Schema API of this instance (Sequelize v6 property; same object as `getQueryInterface()`).
     *
     * @returns The QueryInterface.
     */
    get queryInterface(): QueryInterface {
      return (this as unknown as SequelizeBase).getQueryInterface();
    }

    /**
     * SQL `RANDOM()` call, e.g. for `order: [sequelize.random()]`.
     *
     * @returns A `fn('RANDOM')` expression.
     *
     * @example
     * ```ts
     * const sample = await User.findAll({ order: sequelize.random(), limit: 5 });
     * ```
     */
    random(): Fn {
      return fn('RANDOM');
    }

    /**
     * Renders a value as a PostgreSQL literal, e.g. `'O''Brien'`. Prefer bound parameters for queries.
     *
     * @param value - String, number, boolean, `null`, `Date`, array or JSON value.
     * @returns SQL literal text.
     *
     * @example
     * ```ts
     * const sql = `SELECT ${sequelize.escape("O'Brien")}`; // SELECT 'O''Brien'
     * ```
     */
    escape(value: unknown): string {
      return literals.escape(value);
    }

    /**
     * Alias of `authenticate`: checks that the database is reachable.
     *
     * @param options - Query options.
     * @returns Resolves when the database is reachable.
     * @throws ConnectionError and its subclasses when the connection cannot be established.
     *
     * @example
     * ```ts
     * await sequelize.validate();
     * ```
     */
    validate(options: QueryOptionsBase = {}): Promise<void> {
      return (this as unknown as SequelizeBase).authenticate(options);
    }

    /**
     * Name of the connected database.
     *
     * @returns Database name from the connection settings.
     *
     * @example
     * ```ts
     * const name = sequelize.getDatabaseName();
     * ```
     */
    getDatabaseName(): string | undefined {
      return (this as unknown as SequelizeBase).config.database;
    }

    /**
     * Accepted for compatibility; postgrelize reads type information from each result, so there is nothing to refresh.
     *
     * @example
     * ```ts
     * sequelize.refreshTypes();
     * ```
     */
    refreshTypes(): void {}

    /**
     * Passes a message to the configured `logging` function (or to the `logging` option of the last argument, as in v6).
     *
     * @param args - Message parts; an options object with `logging` may come last.
     *
     * @example
     * ```ts
     * sequelize.log('Cache warmed up');
     * ```
     */
    log(...args: unknown[]): void {
      const last = args.at(-1) as { logging?: unknown; benchmark?: boolean } | undefined;
      const own = typeof last === 'object' && last !== null && 'logging' in last;
      const options = own ? last : (this as unknown as SequelizeBase).options;
      if (own && options.logging === console.log) {
        args.pop();
      }
      const logging = options.logging === true ? console.log : options.logging;
      if (typeof logging === 'function') {
        const benchmark =
          options.benchmark === true ||
          (this as unknown as SequelizeBase).options.benchmark === true;
        (logging as (...messages: unknown[]) => void)(
          ...(benchmark && logging === console.log
            ? [`${args[0]} Elapsed time: ${args[1]}ms`]
            : args),
        );
      }
    }
  };
