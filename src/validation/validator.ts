import validatorJs from 'validator';
import { EXTENSIONS } from './validator-extensions.ts';

type Extensible = typeof validatorJs & {
  extend: (name: string, validate: (value: string, ...args: never[]) => unknown) => Extensible;
};

/**
 * Sequelize v6 `Validator`: a copy of validator.js with the v6 additions and `extend()`; validators
 * registered with it are available to `validate` of attributes.
 *
 * @internal
 */
export const validator = {
  ...validatorJs,
  ...EXTENSIONS,
  extend(name: string, validate: unknown) {
    Reflect.set(this, name, validate);
    return this;
  },
} as unknown as Extensible;
