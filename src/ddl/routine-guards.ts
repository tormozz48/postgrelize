import { SqlCompiler } from '../sql/compile.ts';

const WORD = /^[A-Za-z_]\w*$/;

const TYPE_NAME =
  /^(?:SETOF\s+)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?(?:\s+[A-Za-z_]\w*){0,4}(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\s+[A-Za-z_]\w*){0,4}(?:\[\d*\])*$/;

const DIRECTIONS: ReadonlySet<string> = new Set(['IN', 'OUT', 'INOUT', 'VARIADIC']);

const FUNCTION_OPTIONS: ReadonlySet<string> = new Set([
  'IMMUTABLE',
  'STABLE',
  'VOLATILE',
  'STRICT',
  'CALLED ON NULL INPUT',
  'RETURNS NULL ON NULL INPUT',
  'LEAKPROOF',
  'NOT LEAKPROOF',
  'PARALLEL SAFE',
  'PARALLEL UNSAFE',
  'PARALLEL RESTRICTED',
  'SECURITY DEFINER',
  'SECURITY INVOKER',
  'WINDOW',
]);

const FUNCTION_NUMBER_OPTION = /^(?:COST|ROWS) \d+$/;

const TRIGGER_OPTIONS: ReadonlySet<string> = new Set([
  'FOR EACH ROW',
  'FOR EACH STATEMENT',
  'DEFERRABLE',
  'NOT DEFERRABLE',
  'INITIALLY DEFERRED',
  'INITIALLY IMMEDIATE',
]);

const TRIGGER_REFERENCING =
  /^REFERENCING (?:OLD|NEW) TABLE AS [A-Za-z_]\w*(?: (?:OLD|NEW) TABLE AS [A-Za-z_]\w*)?$/;

const TRIGGER_WHEN = /^WHEN\s*\(/i;

const normalize = (value: string): string => value.trim().replaceAll(/\s+/g, ' ').toUpperCase();

/**
 * Allowlists and patterns for the keywords and type names of functions and triggers that cannot be
 * quoted (ADR-020, ADR-025).
 *
 * @internal
 */
export class RoutineGuards {
  /**
   * A plain identifier word (parameter, variable, language), rendered unquoted so it folds like v6.
   *
   * @param value - Word.
   * @param kind - Kind named in the error.
   * @returns The word.
   * @throws Error for anything but `[A-Za-z_]\w*`.
   */
  word(value: string, kind: string): string {
    if (!WORD.test(value)) {
      throw new Error(`Invalid ${kind}: ${value}`);
    }
    return value;
  }

  /**
   * A type name: words, an optional schema, a length / precision and array brackets.
   *
   * @param value - Type as written in SQL.
   * @param kind - Kind named in the error.
   * @returns The type.
   * @throws Error for anything that is not a type name.
   */
  typeName(value: string, kind: string): string {
    if (typeof value !== 'string' || !TYPE_NAME.test(value.trim())) {
      throw new Error(`Invalid ${kind}: ${String(value)}`);
    }
    return value.trim();
  }

  /**
   * Parameter direction keyword.
   *
   * @param value - Direction.
   * @returns Upper-case direction.
   * @throws Error outside `IN`, `OUT`, `INOUT`, `VARIADIC`.
   */
  direction(value: string): string {
    const direction = normalize(value);
    if (!DIRECTIONS.has(direction)) {
      throw new Error(`Invalid parameter direction: ${value}`);
    }
    return direction;
  }

  /**
   * Function characteristic keywords (`IMMUTABLE`, `SECURITY DEFINER`, `COST n`, ...).
   *
   * @param options - Keywords as given.
   * @returns Normalized keywords.
   * @throws Error for a keyword outside the allowlist.
   */
  functionOptions(options: readonly string[]): readonly string[] {
    return options.map((option) => {
      const keyword = normalize(option);
      if (!FUNCTION_OPTIONS.has(keyword) && !FUNCTION_NUMBER_OPTION.test(keyword)) {
        throw new Error(`Invalid function option: ${option}`);
      }
      return keyword;
    });
  }

  /**
   * Trigger clauses: row / statement level, deferrability, `REFERENCING` transition tables and
   * `WHEN (condition)`. The condition is trusted SQL.
   *
   * @param options - Clauses as given.
   * @returns Normalized clauses (`WHEN` kept as written).
   * @throws Error for a clause outside the allowlist.
   */
  triggerOptions(options: readonly string[]): readonly string[] {
    return options.map((option) => {
      if (TRIGGER_WHEN.test(option.trim())) {
        return option.trim();
      }
      const keyword = normalize(option);
      if (!TRIGGER_OPTIONS.has(keyword) && !TRIGGER_REFERENCING.test(keyword)) {
        throw new Error(`Invalid trigger option: ${option}`);
      }
      return keyword;
    });
  }

  /**
   * Function name: a word or `schema.word` string (unquoted, folds like v6) or `{ name, schema }`
   * (quoted exactly).
   *
   * @param name - Function name.
   * @returns SQL name.
   * @throws Error for a string that is not one or two identifier words.
   */
  functionName(name: string | Readonly<{ name: string; schema?: string }>): string {
    if (typeof name !== 'string') {
      return name.schema === undefined
        ? SqlCompiler.quoteIdent(name.name)
        : `${SqlCompiler.quoteIdent(name.schema)}.${SqlCompiler.quoteIdent(name.name)}`;
    }
    return name
      .split('.')
      .map((part) => this.word(part, 'function name'))
      .join('.');
  }
}
