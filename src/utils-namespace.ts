import { Cast, Col, Fn, Json, Literal, SqlExpression, Where } from './expressions/methods.ts';
import type {
  Cast as CastInstance,
  Col as ColInstance,
  Fn as FnInstance,
  Json as JsonInstance,
  Literal as LiteralInstance,
  Where as WhereInstance,
} from './expressions/methods.ts';
import { inflector, useInflection } from './model/inflector.ts';

/**
 * The part of Sequelize v6 `Utils` that has a postgrelize counterpart: the expression classes
 * behind `fn`, `col`, `cast`, `literal`, `json` and `where` (`Utils.Fn`, `Utils.Literal`, ... both
 * as values and as types), `SequelizeMethod` (the base class of expressions), `useInflection`,
 * `pluralize` and `singularize`. The other v6 helpers are internal and not provided.
 *
 * @example
 * ```ts
 * const isLiteral = (value: unknown): value is Utils.Literal => value instanceof Utils.Literal;
 * const amount: Utils.Literal = literal('1 + 1');
 * ```
 */
export const Utils = Object.freeze({
  Fn,
  Col,
  Cast,
  Literal,
  Json,
  Where,
  SequelizeMethod: SqlExpression,
  useInflection,
  pluralize: (word: string): string => inflector.pluralize(word),
  singularize: (word: string): string => inflector.singularize(word),
});

// Types of `Utils`, kept next to the value so `Utils.Fn` works in type positions (like v6's module).
// oxlint-disable-next-line typescript/no-namespace, typescript/no-redeclare -- the v6 `Utils` is both a value and a type namespace.
export declare namespace Utils {
  /** Expression class behind `fn()`. */
  type Fn = FnInstance;
  /** Expression class behind `col()`. */
  type Col = ColInstance;
  /** Expression class behind `cast()`. */
  type Cast = CastInstance;
  /** Expression class behind `literal()`. */
  type Literal = LiteralInstance;
  /** Expression class behind `json()`. */
  type Json = JsonInstance;
  /** Expression class behind `where()`. */
  type Where = WhereInstance;
  /** Base class of expressions (v6 `SequelizeMethod`). */
  type SequelizeMethod = SqlExpression;
  /** Names of primitive types (v6 `Utils.Primitive`). */
  type Primitive = 'string' | 'number' | 'boolean';
  /** Recursively removes `readonly` (v6 `Utils.DeepWriteable`). */
  type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
  /** Inflection functions (v6 `Utils.Inflector`). */
  interface Inflector {
    /** Singular form of a word. */
    singularize(str: string): string;
    /** Plural form of a word. */
    pluralize(str: string): string;
  }
  /** Any function (v6 `Utils.AnyFunction`). */
  // oxlint-disable-next-line typescript/no-explicit-any -- v6 declares it this way.
  type AnyFunction = (...args: any[]) => any;
  /** Keys of `T` that accept `null` or `undefined` (v6 `Utils.NullishPropertiesOf`). */
  type NullishPropertiesOf<T> = {
    [P in keyof T]-?: undefined extends T[P] ? P : null extends T[P] ? P : never;
  }[keyof T];
}
