import inflection from 'inflection';
import type { AttributeDefinition, ModelAttributes } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type {
  AssociationName,
  AssociationOptions,
  AssociationThrough,
  ForeignKeyOptions,
} from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;

/** Keys resolved by a concrete association. */
export type AssociationKeyFields = Readonly<{
  /** Foreign key attribute. */
  foreignKey: string;
  /** Column of the foreign key. */
  identifierField: string;
  /** Source attribute referenced by the foreign key. */
  sourceKey: string;
  /** Target attribute referenced by the foreign key or by `otherKey`. */
  targetKey: string;
  /** Junction foreign key pointing at the target (belongsToMany). */
  otherKey: string | undefined;
  /** Junction model (belongsToMany). */
  through: AssociationThrough | undefined;
}>;

/** Model and key a foreign key attribute references, with the referential actions given. */
export type ReferenceSpec = Readonly<{
  /** Referenced model. */
  model: Model;
  /** Referenced attribute. */
  key: string;
  /** `ON DELETE` action given in the options. */
  onDelete: string | undefined;
  /** `ON UPDATE` action given in the options. */
  onUpdate: string | undefined;
  /** `constraints` option. */
  constraints: boolean | undefined;
}>;

/** Referential actions used when the options give none (`auto`: `SET NULL` when nullable). */
export type ReferenceDefaults = Readonly<{ onDelete: string; onUpdate: string }>;

/** Alias and keys of a hasOne / hasMany association. */
export type TargetKeys = Readonly<{
  /** Singular and plural alias forms. */
  name: AssociationName;
  /** Resolved keys. */
  keys: AssociationKeyFields;
}>;

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
    const name = registry.state(model).definition.name;
    return { singular: inflection.singularize(name), plural: inflection.pluralize(name) };
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
    return option === undefined ? undefined : typeof option === 'string' ? option : option.name;
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
   * @param allowNull - Whether the key may be `NULL` (for the `auto` delete action).
   * @param defaults - Actions used when the options give none.
   * @returns Attribute options (empty with `constraints: false`).
   */
  reference(spec: ReferenceSpec, allowNull: boolean, defaults: ReferenceDefaults): Values {
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
      onDelete:
        spec.onDelete ??
        (defaults.onDelete === 'auto' ? (allowNull ? 'SET NULL' : 'NO ACTION') : defaults.onDelete),
      onUpdate: spec.onUpdate ?? defaults.onUpdate,
    };
  }

  /**
   * Attribute options of a foreign key.
   *
   * @param type - Referenced attribute (its data type is reused).
   * @param extras - Object form of the foreign key option.
   * @param base - Further attribute options.
   * @returns Attribute options.
   */
  keyAttribute(
    type: AttributeDefinition | undefined,
    extras: ForeignKeyOptions,
    base: Values = {},
  ): Values {
    return {
      type: type?.type,
      allowNull: true,
      ...base,
      ...(extras.field === undefined ? {} : { field: extras.field }),
      ...(extras.allowNull === undefined ? {} : { allowNull: extras.allowNull }),
    };
  }

  /**
   * Resolves the alias and keys of a hasOne / hasMany association and adds the foreign key
   * attribute to the target.
   *
   * @param multi - True for hasMany.
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options.
   * @returns Alias forms and keys.
   */
  targetKeys(
    multi: boolean,
    source: Model,
    target: Model,
    options: AssociationOptions,
  ): TargetKeys {
    const name = this.aliasNames(options.as, this.modelName(target), multi);
    const sourceKey = options.sourceKey ?? this.primaryKey(source);
    const sourcePrefix = multi
      ? this.modelName(source).singular
      : inflection.singularize(
          typeof options.as === 'string' ? options.as : this.modelName(source).singular,
        );
    const foreignKey =
      this.foreignKeyName(options.foreignKey) ??
      this.camelize(`${sourcePrefix}_${this.primaryKey(source)}`);
    registry.addAssociationAttributes(target, {
      [foreignKey]: this.keyAttribute(
        this.attributeOf(source, sourceKey),
        this.foreignKeyExtras(options.foreignKey),
        this.reference(
          {
            model: source,
            key: sourceKey,
            onDelete: options.onDelete,
            onUpdate: options.onUpdate,
            constraints: options.constraints,
          },
          this.foreignKeyExtras(options.foreignKey).allowNull !== false,
          {
            onDelete: 'auto',
            onUpdate: 'CASCADE',
          },
        ),
      ),
    } as ModelAttributes);
    return {
      name,
      keys: {
        foreignKey,
        identifierField: this.fieldOf(target, foreignKey),
        sourceKey,
        targetKey: foreignKey,
        otherKey: undefined,
        through: undefined,
      },
    };
  }
}
