import type { HookType } from '../hooks/hooks.ts';
import type { AttributeOptions } from '../model/attribute-options.ts';
import { signature } from './decorator-signature.ts';
import type {
  ModelClassDecorator,
  ModelPropertyDecorator,
  ModelStaticMethodDecorator,
} from './decorator-types.ts';
import { metadata, type ModelMetadata } from './model-metadata.ts';

type Tc39FieldContext = Readonly<{
  name: string | symbol;
  addInitializer: (initializer: (this: object) => void) => void;
}>;

/**
 * Builds decorators that work with both calling conventions from a function that records
 * something in the metadata of the decorated class.
 *
 * @internal
 */
export class DecoratorFactory {
  /**
   * @param record - Records into the metadata of the class.
   * @returns A class decorator.
   */
  forClass(record: (meta: ModelMetadata) => void): ModelClassDecorator {
    return ((...args: unknown[]): void => {
      record(metadata.of(signature.resolve(args)));
    }) as never;
  }

  /**
   * @param record - Records into the metadata of the class, given the attribute name.
   * @returns An attribute decorator.
   */
  forProperty(record: (meta: ModelMetadata, key: string) => void): ModelPropertyDecorator {
    return ((...args: unknown[]) => {
      const target = signature.resolve(args);
      record(metadata.of(target), target.key as string);
      this.#unshadow(args[1]);
    }) as never;
  }

  /**
   * @param partial - Column options to merge into the attribute.
   * @returns An attribute decorator.
   */
  column(partial: Partial<AttributeOptions>): ModelPropertyDecorator {
    return this.forProperty((meta, key) => {
      meta.columns[key] = { ...meta.columns[key], ...partial };
    });
  }

  /**
   * @param build - Creates the decorator from the optional argument of the factory call.
   * @returns A decorator usable bare (`@Unique`) and called (`@Unique('name')`).
   */
  optionalProperty<A, D extends ModelPropertyDecorator>(
    build: (argument?: A) => D,
  ): D & ((argument?: A) => D) {
    return ((...args: unknown[]) =>
      args.length >= 2
        ? (build() as unknown as (...a: unknown[]) => void)(...args)
        : build(args[0] as A | undefined)) as never;
  }

  /**
   * @param build - Creates the decorator from the optional argument of the factory call.
   * @returns A class decorator usable bare (`@Table`) and called (`@Table({ ... })`).
   */
  optionalClass<A>(
    build: (argument?: A) => ModelClassDecorator,
  ): ModelClassDecorator & ((argument?: A) => ModelClassDecorator) {
    return ((...args: unknown[]) =>
      typeof args[0] === 'function'
        ? (build() as unknown as (...a: unknown[]) => void)(...args)
        : build(args[0] as A | undefined)) as never;
  }

  /**
   * @param type - Hook type to register the decorated static method for.
   * @returns A static method decorator.
   */
  forHook(type: HookType): ModelStaticMethodDecorator {
    return ((...args: unknown[]) => {
      const target = signature.resolve(args);
      if (!target.isStatic || target.key === undefined) {
        throw new Error(`Hook decorators apply to static methods only (${type}).`);
      }
      metadata.of(target).hooks.push({ type, key: target.key });
    }) as never;
  }

  // A class field would shadow the attribute accessors Model.init installs on the prototype, so
  // standard decorators drop the own property right after the field is defined.
  #unshadow(context: unknown): void {
    const field = context as Partial<Tc39FieldContext>;
    if (field.addInitializer === undefined || field.name === undefined) {
      return;
    }
    const name = field.name;
    field.addInitializer(function dropOwnField(this: object) {
      Reflect.deleteProperty(this, name);
    });
  }
}

/** @internal Shared decorator factory. */
export const decorate = new DecoratorFactory();
