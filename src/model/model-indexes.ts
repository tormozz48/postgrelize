import type { IndexOptions } from '../ddl/ddl-types.ts';
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
    return type?.toLowerCase() === 'unique' ? { ...rest, unique: true } : index;
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
