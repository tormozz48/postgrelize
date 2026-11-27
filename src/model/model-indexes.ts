import type { IndexField, IndexOptions } from '../ddl/ddl-types.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';

/**
 * Indexes of a model as Sequelize v6 conforms them: `type: 'unique'` makes the index unique, and a
 * `JSONB` attribute declared with `index: true` gets a `gin` index.
 *
 * @internal
 */
export class ModelIndexes {
  of(definition: ModelDefinition): readonly IndexOptions[] {
    const declared = (definition.options.indexes ?? []).map((index) => this.#conformed(index));
    return [...declared, ...this.#gin(definition)];
  }

  #conformed(index: IndexOptions): IndexOptions {
    const { type, ...rest } = index as IndexOptions & Readonly<{ type?: string }>;
    const conformed = type?.toLowerCase() === 'unique' ? { ...rest, unique: true } : index;
    return conformed.fields === undefined
      ? conformed
      : { ...conformed, fields: conformed.fields.map((field) => this.#named(field)) };
  }

  // v6 also takes the column of a field object under the `attribute` key
  #named(field: IndexField): IndexField {
    const { attribute } = (typeof field === 'string' ? {} : field) as { attribute?: string };
    return attribute === undefined
      ? field
      : ({ ...(field as object), name: attribute } as IndexField);
  }

  #gin(definition: ModelDefinition): readonly IndexOptions[] {
    return [...definition.attributes.values()]
      .filter(
        (attribute) =>
          (attribute as AttributeDefinition & Readonly<{ index?: unknown }>).index === true &&
          attribute.type.key === 'JSONB',
      )
      .map((attribute) => ({ fields: [attribute.field], using: 'gin' }));
  }
}
