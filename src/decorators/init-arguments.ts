import type { HookFunction, HookType, HooksOption } from '../hooks/hooks.ts';
import type { ModelAttributes } from '../model/model-definition.ts';
import type { AnyModel, InitOptions, ModelStatic } from '../model/options.ts';
import type { RuntimeOwner } from '../model/runtime.ts';
import type { IndexOptions } from '../ddl/ddl-generator.ts';
import type { ModelMetadata } from './model-metadata.ts';

type Model = ModelStatic<AnyModel>;

/**
 * Turns the metadata collected for a class into the arguments of `Model.init`, so a decorated
 * model is initialized exactly like a hand-written `init` call.
 *
 * @internal
 */
export class InitArguments {
  /**
   * @param model - Decorated class.
   * @param meta - Metadata collected for it.
   * @returns Attributes for `Model.init`.
   * @throws Error when an attribute has no type.
   */
  attributes(model: Model, meta: ModelMetadata): ModelAttributes {
    for (const [key, column] of Object.entries(meta.columns)) {
      if (column.type === undefined) {
        throw new Error(`${model.name}.${key} has no type: use @Column(DataTypes.<TYPE>).`);
      }
    }
    return meta.columns as ModelAttributes;
  }

  /**
   * @param model - Decorated class.
   * @param meta - Metadata collected for it.
   * @param sequelize - Owning instance.
   * @returns Options for `Model.init`.
   */
  options(model: Model, meta: ModelMetadata, sequelize: RuntimeOwner): InitOptions {
    const { table, timestamps } = meta;
    const paranoid = timestamps.deletedAt === undefined ? {} : { paranoid: true };
    return {
      ...paranoid,
      ...table,
      ...timestamps,
      ...this.#indexes(meta),
      ...this.#hooks(model, meta),
      ...this.#scopes(meta),
      sequelize,
    };
  }

  #indexes({ table, indexes }: ModelMetadata): Pick<InitOptions, 'indexes'> {
    const named = new Map<string, IndexOptions>();
    const all: IndexOptions[] = [...(table.indexes ?? [])];
    for (const { key, options } of indexes) {
      const known = options.name === undefined ? undefined : named.get(options.name);
      if (known === undefined) {
        const created = { ...options, fields: [key] };
        all.push(created);
        if (options.name !== undefined) {
          named.set(options.name, created);
        }
      } else {
        (known.fields as string[]).push(key);
      }
    }
    return all.length === 0 ? {} : { indexes: all };
  }

  #hooks(model: Model, { table, hooks }: ModelMetadata): Pick<InitOptions, 'hooks'> {
    if (hooks.length === 0) {
      return {};
    }
    const merged: Partial<Record<HookType, HookFunction[]>> = {};
    for (const [type, value] of Object.entries(table.hooks ?? {})) {
      merged[type as HookType] = [value].flat() as HookFunction[];
    }
    for (const { type, key } of hooks) {
      const call = (...args: unknown[]): unknown =>
        (model as never as Record<string, (...a: unknown[]) => unknown>)[key]?.(...args);
      (merged[type] ??= []).push(call as HookFunction);
    }
    return { hooks: merged as HooksOption };
  }

  #scopes({ defaultScope, scopes }: ModelMetadata): Pick<InitOptions, 'defaultScope' | 'scopes'> {
    return {
      ...(defaultScope === undefined
        ? {}
        : { defaultScope: typeof defaultScope === 'function' ? defaultScope() : defaultScope }),
      ...(scopes === undefined ? {} : { scopes: typeof scopes === 'function' ? scopes() : scopes }),
    };
  }
}
