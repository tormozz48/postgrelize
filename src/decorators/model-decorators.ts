import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { RuntimeOwner } from '../model/runtime.ts';
import { AssociationApplier } from './association-applier.ts';
import { InitArguments } from './init-arguments.ts';
import { metadata } from './model-metadata.ts';

type Model = ModelStatic<AnyModel>;

/**
 * Registers decorated model classes: initializes every class with `Model.init`, then adds the
 * declared associations, so classes may refer to each other regardless of their order.
 *
 * @internal
 */
export class ModelDecorators {
  readonly #init = new InitArguments();
  readonly #associations = new AssociationApplier();

  /**
   * @param sequelize - Instance the models are registered with.
   * @param models - Decorated model classes.
   */
  register(sequelize: RuntimeOwner, models: readonly Model[]): void {
    for (const model of models) {
      const meta = metadata.collect(model);
      model.init(this.#init.attributes(model, meta), this.#init.options(model, meta, sequelize));
    }
    for (const model of models) {
      for (const spec of metadata.collect(model).associations) {
        this.#associations.apply(model, spec);
      }
    }
  }
}
