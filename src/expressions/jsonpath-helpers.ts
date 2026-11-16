import { Cast, Fn } from './call-expressions.ts';

const KINDS: ReadonlyMap<string, string> = new Map([
  ['exists', 'jsonb_path_exists'],
  ['match', 'jsonb_path_match'],
  ['query', 'jsonb_path_query'],
  ['queryFirst', 'jsonb_path_query_first'],
  ['queryArray', 'jsonb_path_query_array'],
]);

/** Function of {@link jsonbPath}: `exists`, `match`, `query`, `queryFirst` or `queryArray`. */
export type JsonbPathKind = 'exists' | 'match' | 'query' | 'queryFirst' | 'queryArray';

/**
 * Options of {@link jsonbPath}.
 *
 * @example
 * ```ts
 * const options: JsonbPathOptions = { vars: { min: 10 }, silent: true };
 * ```
 */
export type JsonbPathOptions = Readonly<{
  /** Values of the `$name` variables of the path; serialized to jsonb and bound as a parameter. */
  vars?: Readonly<Record<string, unknown>>;
  /** Suppresses missing-key and type errors of the path (the `silent` argument). */
  silent?: boolean;
  /** Uses the `_tz` variant, which converts between time zones (stable instead of immutable). */
  tz?: boolean;
}>;

const functionName = (kind: string, tz: boolean): string => {
  const name = KINDS.get(kind);
  if (name === undefined) {
    throw new Error(`Invalid jsonb path function: ${String(kind)}`);
  }
  return tz ? `${name}_tz` : name;
};

const optionalArgs = (options: JsonbPathOptions): readonly unknown[] =>
  options.vars === undefined && options.silent === undefined
    ? []
    : [
        new Cast(JSON.stringify(options.vars ?? {}), 'jsonb'),
        ...(options.silent === undefined ? [] : [new Cast(options.silent === true, 'boolean')]),
      ];

/**
 * Calls a `jsonb_path_*` function (`exists`, `match`, `query`, `queryFirst`, `queryArray`) with a
 * bound jsonpath. PostgreSQL extension.
 *
 * `Op.jsonPathExists` (`@?`) and `Op.match` (`@@`) are the operator forms of `exists` and `match`.
 *
 * @param kind - Which function to call.
 * @param target - jsonb expression, e.g. `col('doc')`.
 * @param path - jsonpath text, bound as a parameter. Invalid syntax is a database error.
 * @param options - `vars`, `silent` and `tz`.
 * @returns Function call expression.
 * @throws Error when `kind` is not one of the five names.
 * @example
 * ```ts
 * await Product.findAll({ where: where(jsonbPath('exists', col('attrs'), '$.price ? (@ > $min)', { vars: { min: 10 } }), true) });
 * ```
 */
export const jsonbPath = (
  kind: JsonbPathKind,
  target: unknown,
  path: string,
  options: JsonbPathOptions = {},
): Fn =>
  new Fn(functionName(kind, options.tz === true), [
    target,
    new Cast(path, 'jsonpath'),
    ...optionalArgs(options),
  ]);
