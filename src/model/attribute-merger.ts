import type { AttributeNormalizer } from './attribute-normalizer.ts';
import type { AttributeOptions, ModelAttributes } from './attribute-options.ts';

type Plain = Readonly<Record<string, unknown>>;

type Values = Readonly<Record<string, unknown>>;

/**
 * Merges the foreign key attributes of associations into attributes the model declares itself,
 * like Sequelize v6 `mergeDefaults`: declared values win, missing ones (`references`, `onDelete`,
 * `onUpdate`, `allowNull`) are filled in.
 *
 * @internal
 */
export class AttributeMerger {
  readonly #attributes: AttributeNormalizer;

  constructor(attributes: AttributeNormalizer) {
    this.#attributes = attributes;
  }

  merge(declared: ModelAttributes, added: ModelAttributes): ModelAttributes {
    return Object.fromEntries(
      Object.entries(declared).map(([name, input]) => {
        const defaults = added[name];
        if (defaults === undefined) {
          return [name, input];
        }
        const own = this.#attributes.isOptions(input) ? input : { type: input };
        return [name, this.#fill(own as Plain, defaults as Plain) as AttributeOptions];
      }),
    );
  }

  #fill(own: Plain, defaults: Plain): Plain {
    const filled: Record<string, unknown> = { ...own };
    for (const [key, value] of Object.entries(defaults)) {
      if (own[key] === undefined) {
        filled[key] = value;
      } else if (this.#isPlain(own[key]) && this.#isPlain(value)) {
        filled[key] = this.#fill(own[key] as Plain, value as Plain);
      }
    }
    return filled;
  }

  #isPlain(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }

  // like v6, the method maps of `define` defaults and of the model are merged entry by entry
  options<T extends object>(defaults: object, options: T): T {
    const maps = ['getterMethods', 'setterMethods', 'validate'] as const;
    const merged = maps.flatMap((key) => {
      const [given, own] = [defaults, options].map((source) => (source as Values)[key]);
      return given === undefined || own === undefined
        ? []
        : [[key, { ...(given as object), ...(own as object) }] as const];
    });
    return { ...defaults, ...options, ...Object.fromEntries(merged) } as T;
  }
}
