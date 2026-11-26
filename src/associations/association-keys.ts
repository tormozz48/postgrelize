import { inflector as inflection } from '../model/inflector.ts';
import type { AttributeDefinition, ModelAttributes } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { ReferenceDefaults, ReferenceSpec } from './association-key-types.ts';
import type { AssociationName, AssociationOptions, ForeignKeyOptions } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;

export type {
  AssociationKeyFields,
  ReferenceDefaults,
  ReferenceSpec,
  TargetKeys,
} from './association-key-types.ts';

/** Naming and foreign key attribute rules shared by the association classes (Sequelize v6 defaults). */
export class AssociationKeys {
  /**
   * Converts `snake_case` / `kebab-case` / spaced names to camelCase.
   *
   * @param value - Name to convert.
   * @returns camelCase name.
   */
  camelize(value: string): string {
    return value
      .trim()
      .replace(/[-_\s]+(.)?/g, (_match, char?: string) => (char ?? '').toUpperCase());
  }

  /**
   * Singular and plural forms of a model name.
   *
   * @param model - Model class.
   * @returns Name forms.
   */
  modelName(model: Model): AssociationName {
    const definition = registry.state(model).definition;
    const forms = definition.options.name;
    return {
      singular: forms?.singular ?? inflection.singularize(definition.name),
      plural: forms?.plural ?? inflection.pluralize(definition.name),
    };
  }

  /**
   * First primary key attribute of a model.
   *
   * @param model - Model class.
   * @returns Attribute name (`id` when the model has none).
   */
  primaryKey(model: Model): string {
    return registry.state(model).definition.primaryKeys[0] ?? 'id';
  }

  /**
   * Attribute definition by name.
   *
   * @param model - Model class.
   * @param name - Attribute name.
   * @returns Definition, if the attribute exists.
   */
  attributeOf(model: Model, name: string): AttributeDefinition | undefined {
    return registry.state(model).definition.attributes.get(name);
  }

  /**
   * Column of an attribute.
   *
   * @param model - Model class.
   * @param name - Attribute name.
   * @returns Column name (the attribute name when not defined).
   */
  fieldOf(model: Model, name: string): string {
    return this.attributeOf(model, name)?.field ?? name;
  }

  /**
   * Attribute name of a `foreignKey` / `otherKey` option.
   *
   * @param option - Option value.
   * @returns Attribute name, if given.
   */
  foreignKeyName(option: string | ForeignKeyOptions | undefined): string | undefined {
    // an existing attribute (`Model.rawAttributes.x`) is accepted too: it is named by `fieldName`
    return typeof option === 'object'
      ? (option.name ?? (option as Readonly<{ fieldName?: string }>).fieldName)
      : option;
  }

  /**
   * Object form of a `foreignKey` / `otherKey` option.
   *
   * @param option - Option value.
   * @returns Foreign key options (empty for a string).
   */
  foreignKeyExtras(option: string | ForeignKeyOptions | undefined): ForeignKeyOptions {
    return option === undefined || typeof option === 'string' ? {} : option;
  }

  /**
   * Singular and plural alias forms.
   *
   * @param as - `as` option.
   * @param fallback - Forms used without `as`.
   * @param multi - Whether a string alias is the plural form.
   * @returns Alias forms.
   */
  aliasNames(
    as: string | AssociationName | undefined,
    fallback: AssociationName,
    multi: boolean,
  ): AssociationName {
    return as === undefined
      ? fallback
      : typeof as === 'string'
        ? multi
          ? { singular: inflection.singularize(as), plural: as }
          : { singular: as, plural: inflection.pluralize(as) }
        : as;
  }

  /**
   * `references` / `onDelete` / `onUpdate` attribute options of a foreign key.
   *
   * @param spec - Referenced model and key, with the actions from the options.
   * @param defaults - Actions used when the options give none.
   * @returns Attribute options (empty with `constraints: false`).
   */
  reference(spec: ReferenceSpec, defaults: ReferenceDefaults): Values {
    if (spec.constraints === false) {
      return {};
    }
    const definition = registry.state(spec.model).definition;
    return {
      references: {
        model: {
          tableName: definition.tableName,
          ...(definition.schema === undefined ? {} : { schema: definition.schema }),
        },
        key: definition.attributes.get(spec.key)?.field ?? spec.key,
      },
      onDelete: spec.onDelete ?? defaults.onDelete,
      onUpdate: spec.onUpdate ?? defaults.onUpdate,
    };
  }

  /**
   * Attribute options of a foreign key. Like v6, the object form of the option may carry any
   * attribute option (`type`, `defaultValue`, ...).
   *
   * @param type - Referenced attribute (its data type is reused).
   * @param option - Object form of the foreign key option.
   * @param base - Further attribute options; its `references` and actions win.
   * @returns Attribute options.
   */
  keyAttribute(
    type: AttributeDefinition | undefined,
    option: ForeignKeyOptions,
    base: Values = {},
  ): Values {
    const { name: _name, fieldName: _fieldName, ...extras } = option as Values;
    const given = Object.entries(extras).filter(([, value]) => value !== undefined);
    const fixed = ['references', 'onDelete', 'onUpdate'].filter((key) => key in base);
    return {
      type: type?.type,
      allowNull: true,
      ...base,
      ...Object.fromEntries(given.filter(([key]) => !fixed.includes(key))),
    };
  }

  /**
   * Adds the foreign key attribute (with its reference) to the model that holds the key.
   *
   * @param owner - Model that holds the foreign key.
   * @param referenced - Model the key references.
   * @param referencedKey - Referenced attribute.
   * @param foreignKey - Foreign key attribute name.
   * @param options - Association options.
   * @param notNullAction - `ON DELETE` of a key that cannot be `NULL`, when none is given.
   */
  addForeignKey(
    owner: Model,
    referenced: Model,
    referencedKey: string,
    foreignKey: string,
    options: AssociationOptions,
    notNullAction: 'CASCADE' | 'NO ACTION',
  ): void {
    const extras = this.foreignKeyExtras(options.foreignKey);
    const spec = { model: referenced, key: referencedKey, ...this.#actions(options) };
    const onDelete = this.#nullable(owner, foreignKey, extras) ? 'SET NULL' : notNullAction;
    registry.addAssociationAttributes(owner, {
      [foreignKey]: this.keyAttribute(
        this.attributeOf(referenced, referencedKey),
        extras,
        this.#keyColumn(spec, onDelete, options),
      ),
    } as ModelAttributes);
  }

  // v6 derives the delete action from the `allowNull` of an attribute the model already declares
  #nullable(owner: Model, foreignKey: string, extras: ForeignKeyOptions): boolean {
    const { input } = registry.state(owner);
    const existing = input.attributes[foreignKey] ?? input.extra[foreignKey];
    return existing === undefined
      ? extras.allowNull !== false
      : Boolean((existing as ForeignKeyOptions).allowNull);
  }

  // reference of the new foreign key, with the data type of `keyType` when given
  #keyColumn(spec: ReferenceSpec, onDelete: string, options: AssociationOptions): Values {
    return {
      ...this.reference(spec, { onDelete, onUpdate: 'CASCADE' }),
      ...(options.keyType === undefined ? {} : { type: options.keyType }),
    };
  }

  #actions(options: AssociationOptions): Omit<ReferenceSpec, 'model' | 'key'> {
    return {
      onDelete: options.onDelete,
      onUpdate: options.onUpdate,
      constraints: options.constraints,
    };
  }
}
