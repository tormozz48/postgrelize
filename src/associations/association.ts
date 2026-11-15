import { AssociationError } from '../errors/errors.ts';
import { Op } from '../expressions/op.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { AssociationKeyFields } from './association-keys.ts';
import type {
  Association as AssociationFields,
  AssociationName,
  AssociationOptions,
  AssociationThrough,
  AssociationType,
} from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;
type AccessorImplementation = (instance: Instance, ...args: never[]) => unknown;

/** Query options accepted by the accessor methods (`getPosts(options)`, ...). */
export type AccessorOptions = Values &
  Readonly<{ where?: unknown; transaction?: unknown; logging?: unknown }>;

/** Accessor key (see {@link Association.accessors}) → association method implementing it. */
const ACCESSOR_METHODS: Readonly<Record<string, string>> = {
  get: 'get',
  set: 'set',
  create: 'create',
  add: 'add',
  addMultiple: 'add',
  remove: 'remove',
  removeMultiple: 'remove',
  hasSingle: 'has',
  hasAll: 'has',
  count: 'count',
};

const upperFirst = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const accessorsFor = (
  type: AssociationType,
  name: AssociationName,
): Readonly<Record<string, string>> => {
  const singular = upperFirst(name.singular);
  const plural = upperFirst(name.plural);
  return type === 'BelongsTo' || type === 'HasOne'
    ? { get: `get${singular}`, set: `set${singular}`, create: `create${singular}` }
    : {
        get: `get${plural}`,
        set: `set${plural}`,
        addMultiple: `add${plural}`,
        add: `add${singular}`,
        create: `create${singular}`,
        remove: `remove${singular}`,
        removeMultiple: `remove${plural}`,
        hasSingle: `has${singular}`,
        hasAll: `has${plural}`,
        count: `count${plural}`,
      };
};

const instanceMethod = (
  association: Association,
  implementation: AccessorImplementation,
): ((this: Instance, ...args: never[]) => unknown) =>
  function accessor(this: Instance, ...args: never[]): unknown {
    return implementation.call(association, this, ...args);
  };

/**
 * Association between two models (Sequelize v6 `Association`). Subclasses resolve the keys,
 * add the foreign key attributes and implement the accessor methods that are installed on the
 * source prototype (`getX`, `setX`, `createX`, ...).
 */
export abstract class Association implements AssociationFields {
  /** Kind of association. */
  readonly associationType: AssociationType;
  /** Model the association is defined on. */
  readonly source: Model;
  /** Associated model. */
  readonly target: Model;
  /** Alias used in `include` and as the instance property. */
  readonly as: string;
  /** Singular and plural alias forms. */
  readonly name: AssociationName;
  /** Whether `as` was given explicitly. */
  readonly isAliased: boolean;
  /** Association scope. */
  readonly scope: Readonly<Record<string, unknown>> | undefined;
  /** True for belongsTo / hasOne. */
  readonly isSingleAssociation: boolean;
  /** True for hasMany / belongsToMany. */
  readonly isMultiAssociation: boolean;
  /** Names of the instance methods added to the source model. */
  readonly accessors: Readonly<Record<string, string>>;
  /** Foreign key attribute (on the source for belongsTo, on the target for hasOne/hasMany, on the junction for belongsToMany). */
  readonly foreignKey: string;
  /** Column of the foreign key. */
  readonly identifierField: string;
  /** Source attribute referenced by the foreign key. */
  readonly sourceKey: string;
  /** Target attribute referenced by the foreign key (belongsTo) or by `otherKey` (belongsToMany). */
  readonly targetKey: string;
  /** Junction foreign key pointing at the target (belongsToMany). */
  readonly otherKey: string | undefined;
  /** Junction model (belongsToMany). */
  readonly through: AssociationThrough | undefined;

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
    const multi = type === 'HasMany' || type === 'BelongsToMany';
    this.associationType = type;
    this.source = source;
    this.target = target;
    this.as = multi ? name.plural : name.singular;
    this.name = name;
    this.isAliased = options.as !== undefined;
    this.scope = options.scope;
    this.isSingleAssociation = !multi;
    this.isMultiAssociation = multi;
    this.accessors = accessorsFor(type, name);
    this.foreignKey = keys.foreignKey;
    this.identifierField = keys.identifierField;
    this.sourceKey = keys.sourceKey;
    this.targetKey = keys.targetKey;
    this.otherKey = keys.otherKey;
    this.through = keys.through;
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
    this.#mixin();
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
   * @returns `transaction`, `logging` and `benchmark`.
   */
  protected passThrough(options: AccessorOptions): Values {
    return Object.fromEntries(
      Object.entries(options).filter(([key]) =>
        ['transaction', 'logging', 'benchmark'].includes(key),
      ),
    );
  }

  #mixin(): void {
    const prototype = this.source.prototype as object;
    const methods = this as unknown as Readonly<Record<string, unknown>>;
    Object.entries(this.accessors).forEach(([key, methodName]) => {
      const implementation = methods[ACCESSOR_METHODS[key] ?? ''];
      if (
        typeof implementation === 'function' &&
        !Object.prototype.hasOwnProperty.call(prototype, methodName)
      ) {
        Object.defineProperty(prototype, methodName, {
          configurable: true,
          writable: true,
          value: instanceMethod(this, implementation as AccessorImplementation),
        });
      }
    });
  }
}
