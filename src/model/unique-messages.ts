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

  #declared(definition: ModelDefinition): readonly Declared[] {
    const attributes = [...definition.attributes.values()].flatMap((attribute) => {
      const { msg, name } = (
        typeof attribute.unique === 'object' && attribute.unique !== null ? attribute.unique : {}
      ) as Readonly<{ msg?: string; name?: string }>;
      return msg ? [{ key: name ?? attribute.field, columns: [attribute.field], msg }] : [];
    });
    const merged = new Map<string, Declared>();
    for (const { key, columns, msg } of attributes) {
      merged.set(key, { key, msg, columns: [...(merged.get(key)?.columns ?? []), ...columns] });
    }
    return [...merged.values()];
  }
}
