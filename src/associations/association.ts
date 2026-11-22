import { AssociationError } from '../errors/errors.ts';
import { Op } from '../expressions/op.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import { AssociationAccessors } from './association-accessors.ts';
import type { AssociationKeyFields } from './association-key-types.ts';
import { AssociationShape } from './association-shape.ts';
import type {
  Association as AssociationFields,
  AssociationName,
  AssociationOptions,
  AssociationThrough,
  AssociationType,
} from './types.ts';

const registry = new ModelRegistry();
const shape = new AssociationShape();
const accessors = new AssociationAccessors();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

/** Query options accepted by the accessor methods (`getPosts(options)`, ...). */
export type AccessorOptions = Values &
  Readonly<{ where?: unknown; transaction?: unknown; logging?: unknown }>;

/**
 * Association between two models (Sequelize v6 `Association`). Subclasses resolve the keys,
 * add the foreign key attributes and implement the accessor methods that are installed on the
 * source prototype (`getX`, `setX`, `createX`, ...).
 */
export abstract class Association implements AssociationFields {
  /** Kind of association. */
  declare readonly associationType: AssociationType;
  /** Model the association is defined on. */
  declare readonly source: Model;
  /** Associated model. */
  declare readonly target: Model;
  /** Alias used in `include` and as the instance property. */
  declare readonly as: string;
  /** Singular and plural alias forms. */
  declare readonly name: AssociationName;
  /** Whether `as` was given explicitly. */
  declare readonly isAliased: boolean;
  /** Association scope. */
  declare readonly scope: Readonly<Record<string, unknown>> | undefined;
  /** True for belongsTo / hasOne. */
  declare readonly isSingleAssociation: boolean;
  /** True for hasMany / belongsToMany. */
  declare readonly isMultiAssociation: boolean;
  /** Names of the instance methods added to the source model. */
  declare readonly accessors: Readonly<Record<string, string>>;
  /** Foreign key attribute (on the source for belongsTo, on the target for hasOne/hasMany, on the junction for belongsToMany). */
  declare readonly foreignKey: string;
  /** Column of the foreign key. */
  declare readonly identifierField: string;
  /** Source attribute referenced by the foreign key. */
  declare readonly sourceKey: string;
  /** Target attribute referenced by the foreign key (belongsTo) or by `otherKey` (belongsToMany). */
  declare readonly targetKey: string;
  /** Junction foreign key pointing at the target (belongsToMany). */
  declare readonly otherKey: string | undefined;
  /** Junction model (belongsToMany). */
  declare readonly through: AssociationThrough | undefined;

  /**
   * @param type - Kind of association.
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   * @param name - Singular and plural alias forms.
   * @param keys - Resolved keys.
   */
  protected constructor(
    type: AssociationType,
    source: Model,
    target: Model,
    options: AssociationOptions,
    name: AssociationName,
    keys: AssociationKeyFields,
  ) {
    Object.assign(this, shape.fields({ type, source, target, options, name, keys }));
  }

  /**
   * Registers the association on the source model, installs the accessor methods and the
   * instance properties of the alias (and of the junction model on the target).
   *
   * @throws AssociationError when the alias is already used on the source.
   */
  protected install(): void {
    registry.update(this.source, (state) => {
      if (state.associations.has(this.as)) {
        throw new AssociationError(
          `You have used the alias ${this.as} in two separate associations. Aliased associations must have unique aliases.`,
        );
      }
      return { ...state, associations: new Map([...state.associations, [this.as, this]]) };
    });
    accessors.install(this, this.source.prototype as object, this.accessors);
    registry.defineAssociationAccessor((this.source as { prototype: object }).prototype, this.as);
    if (this.through !== undefined) {
      registry.defineAssociationAccessor(
        (this.target as { prototype: object }).prototype,
        registry.state(this.through.model).definition.name,
      );
    }
  }

  /**
   * Values of an array-or-single argument as a list.
   *
   * @param value - One value, a list, `null` or `undefined`.
   * @returns List of values.
   */
  protected toArray<T>(value: T | readonly T[] | null | undefined): readonly T[] {
    return value === null || value === undefined ? [] : Array.isArray(value) ? value : [value as T];
  }

  /**
   * Attribute of an instance, or the value itself for a key given directly.
   *
   * @param item - Instance or key value.
   * @param key - Attribute name.
   * @returns Key value.
   */
  protected keyOf(item: unknown, key: string): unknown {
    return typeof item === 'object' && item !== null && 'get' in item
      ? (item as Instance).get(key)
      : item;
  }

  /**
   * `Op.and` of the given conditions, skipping missing ones.
   *
   * @param parts - Conditions.
   * @returns Where condition.
   */
  protected andWhere(...parts: readonly unknown[]): Values {
    return { [Op.and]: parts.filter((part) => part !== undefined && part !== null) };
  }

  /**
   * Query options passed on to the queries an accessor runs.
   *
   * @param options - Accessor options.
   * @returns `transaction`, `logging`, `benchmark` and `retry`.
   */
  protected passThrough(options: AccessorOptions): Values {
    return Object.fromEntries(
      Object.entries(options).filter(([key]) =>
        ['transaction', 'logging', 'benchmark', 'retry'].includes(key),
      ),
    );
  }
}
