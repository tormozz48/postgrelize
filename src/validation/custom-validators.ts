import { promisify } from 'node:util';

/** Runs user-supplied validator functions (sync, async or callback style). */
export class CustomValidators {
  /**
   * Calls a validator with the instance as `this`.
   *
   * @param instance - Instance being validated.
   * @param fn - Validator function; with one parameter more than `args` it is callback style.
   * @param args - Arguments passed before the callback.
   * @returns The failure message, or `undefined` when the validator passed.
   */
  async failure(
    instance: object,
    fn: (...args: never[]) => unknown,
    args: readonly unknown[],
  ): Promise<string | undefined> {
    try {
      await this.#call(instance, fn, args);
      return undefined;
    } catch (error) {
      return CustomValidators.#messageOf(error);
    }
  }

  async #call(
    instance: object,
    fn: (...args: never[]) => unknown,
    args: readonly unknown[],
  ): Promise<void> {
    if (fn.length === args.length + 1) {
      await promisify((fn as (...callArgs: unknown[]) => unknown).bind(instance, ...args))();
      return;
    }
    await (fn as (...callArgs: unknown[]) => unknown).apply(instance, [...args]);
  }

  static #messageOf(error: unknown): string {
    return error instanceof Error
      ? error.message
      : typeof error === 'string' && error !== ''
        ? error
        : 'Validation error';
  }
}
