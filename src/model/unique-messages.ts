import { UniqueConstraintError } from '../errors/errors.ts';
import type { ModelDefinition } from './model-definition.ts';

type Declared = Readonly<{ key: string; columns: string[]; msg: string }>;

/**
 * Applies the custom `msg` of `unique` attributes to a `UniqueConstraintError`, like
 * Sequelize v6.
 *
 * @internal
 */
export class UniqueMessages {
  /**
   * @param error - Error of a failed statement.
   * @param definitions - Definitions of the models of the instance.
   * @returns The same error, with the custom messages.
   */
  apply(error: unknown, definitions: () => readonly ModelDefinition[]): unknown {
    if (!(error instanceof UniqueConstraintError)) {
      return error;
    }
    const table = (error.parent as Readonly<{ table?: string }> | undefined)?.table;
    const declared = definitions()
      .filter((definition) => definition.tableName === table)
      .flatMap((definition) => this.#declared(definition));
    this.#rename(error, declared);
    return error;
  }

  #rename(error: UniqueConstraintError, declared: readonly Declared[]): void {
    const columns = Object.keys(error.fields).map((column) => column.replaceAll('"', ''));
    const exact = declared.find(
      (key) =>
        key.columns.length === columns.length && columns.every((c) => key.columns.includes(c)),
    );
    if (exact !== undefined) {
      Object.assign(error, { message: exact.msg });
    }
    for (const item of error.errors) {
      const found = declared.find((key) => key.columns.includes(String(item.path)));
      Object.assign(item, { message: found?.msg ?? item.message });
    }
  }

  // like v6 `uniqueKeys`: attributes naming one key form it, any of them may declare the `msg`
  #declared(definition: ModelDefinition): readonly Declared[] {
    const merged = new Map<string, { columns: string[]; msg?: string }>();
    for (const { field, unique } of definition.attributes.values()) {
      if (unique === undefined || unique === null || unique === false) {
        continue;
      }
      const { name, msg } = (typeof unique === 'object' ? unique : {}) as Readonly<{
        name?: string;
        msg?: string;
      }>;
      const key = typeof unique === 'string' ? unique : (name ?? field);
      const known = merged.get(key) ?? { columns: [] };
      merged.set(key, { columns: [...known.columns, field], ...this.#message(known.msg ?? msg) });
    }
    return [...merged].flatMap(([key, { columns, msg }]) => (msg ? [{ key, columns, msg }] : []));
  }

  #message(msg: string | undefined): { msg?: string } {
    return msg ? { msg } : {};
  }
}
