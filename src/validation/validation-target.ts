import type { ModelDefinition } from '../model/model-definition.ts';

/** Data needed to validate one instance. */
export type ValidationTarget = Readonly<{
  instance: object;
  definition: ModelDefinition;
  values: Readonly<Record<string, unknown>>;
  previous: Readonly<Record<string, unknown>>;
  isNewRecord: boolean;
}>;

/** Which attributes / model validators to skip. */
export type ValidationScope = Readonly<{ skip: ReadonlySet<string> }>;
