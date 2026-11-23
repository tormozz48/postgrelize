import { AggregateError, BulkRecordError, ValidationError } from '../errors/errors.ts';
import type { ValidationErrorItem } from '../errors/errors.ts';
import type { InstanceLifecycleServices, ValidateOptions } from './instance-lifecycle-services.ts';
import type { InstanceLifecycle } from './instance-lifecycle.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { ModelState } from './model-registry.ts';
import type { AnyModel } from './options.ts';

/**
 * Instance validation with `beforeValidate` / `afterValidate` / `validationFailed` hooks, and the
 * validation of bulk writes.
 *
 * @internal
 */
export class InstanceValidation {
  readonly #services: InstanceLifecycleServices;
  readonly #lifecycle: InstanceLifecycle;

  /**
   * @param services - Collaborators.
   * @param lifecycle - Hook runner.
   */
  constructor(services: InstanceLifecycleServices, lifecycle: InstanceLifecycle) {
    this.#services = services;
    this.#lifecycle = lifecycle;
  }

  /**
   * Validates an instance like Sequelize v6 `instance.validate()`.
   *
   * @param instance - Instance.
   * @param options - `hooks`, `skip`, `fields`.
   * @returns The instance, when valid (as v6 does at runtime).
   * @throws ValidationError with all failures.
   */
  async validate(instance: AnyModel, options: ValidateOptions): Promise<AnyModel> {
    const model = instance.constructor;
    const state = this.#services.registry.state(model);
    const hooks = options.hooks !== false;
    const skip = this.#skipped(state.definition, options);
    if (hooks) {
      await this.#lifecycle.runHooks(model, 'beforeValidate', instance, options);
    }
    await this.#throwFailures(instance, skip, options);
    if (hooks) {
      await this.#lifecycle.runHooks(model, 'afterValidate', instance, options);
    }
    return instance;
  }

  async #throwFailures(
    instance: AnyModel,
    skip: ReadonlySet<string>,
    options: ValidateOptions,
  ): Promise<void> {
    const model = instance.constructor;
    const items = await this.#failures(instance, this.#services.registry.state(model), skip);
    if (items.length === 0) {
      return;
    }
    const error = new ValidationError(null, items);
    if (options.hooks !== false) {
      await this.#lifecycle.runHooks(model, 'validationFailed', instance, options, error);
    }
    throw error;
  }

  /**
   * Validates instances of a bulk write; failures are collected into one error.
   *
   * @param instances - Instances.
   * @param hooks - Run validation hooks.
   * @returns Resolves when all are valid.
   * @throws AggregateError of BulkRecordError.
   */
  async validateAll(instances: readonly AnyModel[], hooks: boolean): Promise<void> {
    const failures = await Promise.all(
      instances.map((instance) =>
        instance.validate({ hooks }).then(
          () => undefined,
          (error: unknown) =>
            new BulkRecordError(
              error instanceof Error ? error : new Error(String(error)),
              instance,
            ),
        ),
      ),
    );
    const errors = failures.filter((failure): failure is BulkRecordError => failure !== undefined);
    if (errors.length > 0) {
      throw new AggregateError(errors);
    }
  }

  #skipped(definition: ModelDefinition, options: ValidateOptions): ReadonlySet<string> {
    const attributes = [...definition.attributes.keys()];
    return new Set(
      options.skip ??
        (options.fields === undefined
          ? []
          : attributes.filter((name) => !options.fields?.includes(name))),
    );
  }

  #failures(
    instance: AnyModel,
    state: ModelState,
    skip: ReadonlySet<string>,
  ): Promise<readonly ValidationErrorItem[]> {
    return this.#services.validator.validate(
      {
        instance,
        definition: state.definition,
        values: instance.dataValues as Readonly<Record<string, unknown>>,
        previous: instance._previousDataValues as Readonly<Record<string, unknown>>,
        isNewRecord: instance.isNewRecord,
      },
      { skip },
      state.validators,
      state.schema,
    );
  }
}
