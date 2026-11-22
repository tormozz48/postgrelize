import type { AnyModel, ModelStatic } from '../model/options.ts';

/**
 * Registry of the models of a `Sequelize` instance (Sequelize v6 `sequelize.modelManager`), a view on `sequelize.models`.
 *
 * @example
 * ```ts
 * sequelize.modelManager.removeModel(sequelize.model('Temp'));
 * ```
 */
export class ModelManager {
  readonly #models: Record<string, ModelStatic<AnyModel>>;

  /**
   * @param models - The `sequelize.models` object this manager reads and writes.
   */
  constructor(models: Record<string, ModelStatic<AnyModel>>) {
    this.#models = models;
  }

  /** Defined models in definition order; assigning a list replaces them (v6 tests reset the manager with `models = []`). */
  get models(): ModelStatic<AnyModel>[] {
    return Object.values(this.#models);
  }

  set models(list: readonly ModelStatic<AnyModel>[]) {
    for (const name of Object.keys(this.#models)) {
      delete this.#models[name];
    }
    list.forEach((model) => this.addModel(model));
  }

  /**
   * Adds a model under its name.
   *
   * @param model - Model class.
   * @returns The model.
   */
  addModel<M extends ModelStatic<AnyModel>>(model: M): M {
    this.#models[model.name] = model;
    return model;
  }

  /**
   * Removes a model from `sequelize.models`; its table is not touched.
   *
   * @param model - Model class.
   */
  removeModel(model: ModelStatic<AnyModel>): void {
    delete this.#models[model.name];
  }

  /**
   * Finds a model by name.
   *
   * @param against - Model name.
   * @returns The model, or `undefined`.
   */
  getModel(against: string): ModelStatic<AnyModel> | undefined {
    return this.#models[against];
  }
}
