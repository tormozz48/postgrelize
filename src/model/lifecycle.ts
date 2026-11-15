import { ValidationError } from '../errors/errors.ts';
import { HookRegistry, type HookType } from '../hooks/hooks.ts';
import { Op } from '../expressions/op.ts';
import { InstanceValidator } from '../validation/instance-validator.ts';
import type { ModelDefinition } from './definition.ts';
import { stateOf } from './state.ts';

const instanceValidator = new InstanceValidator();

/** Runs model hooks, then Sequelize-level hooks, with the model class as `this`. */
export const runModelHooks = (
  model: object,
  type: HookType,
  ...args: readonly unknown[]
): Promise<void> => {
  const { hooks, runtime } = stateOf(model);
  return HookRegistry.runAll([hooks, runtime.hooks()], type, model, ...args);
};

/** Options of `instance.validate()`. */
export type ValidateOptions = Readonly<{
  /** Run `beforeValidate` / `afterValidate` / `validationFailed` hooks. Default true. */
  hooks?: boolean;
  /** Attributes to skip. */
  skip?: readonly string[];
  /** Only validate these attributes. */
  fields?: readonly string[];
}>;

type Validatable = Readonly<{
  constructor: object;
  dataValues: object;
  _previousDataValues: object;
  isNewRecord: boolean;
}>;

/** Validates an instance like Sequelize v6 `instance.validate()`. */
export const validateWithHooks = async (
  instance: Validatable,
  options: ValidateOptions = {},
): Promise<void> => {
  const model = instance.constructor;
  const state = stateOf(model);
  const hooks = options.hooks !== false;
  const attributes = [...state.definition.attributes.keys()];
  const skip = new Set(
    options.skip ??
      (options.fields === undefined
        ? []
        : attributes.filter((name) => !options.fields?.includes(name))),
  );
  if (hooks) {
    await runModelHooks(model, 'beforeValidate', instance, options);
  }
  const items = await instanceValidator.validate(
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
  if (items.length > 0) {
    const error = new ValidationError(null, items);
    if (hooks) {
      await runModelHooks(model, 'validationFailed', instance, options, error);
    }
    throw error;
  }
  if (hooks) {
    await runModelHooks(model, 'afterValidate', instance, options);
  }
};

/** Adds `deletedAt IS NULL` to `where` for paranoid models unless `paranoid: false`. */
export const withParanoid = (
  definition: ModelDefinition,
  where: unknown,
  paranoid: boolean | undefined,
): unknown => {
  if (definition.deletedAt === undefined || paranoid === false) {
    return where;
  }
  const notDeleted = { [definition.deletedAt]: null };
  return where === undefined || where === null ? notDeleted : { [Op.and]: [notDeleted, where] };
};
