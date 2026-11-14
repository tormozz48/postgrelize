import type { OrderNode } from './ast.ts';

/** Allowed order directions. */
const DIRECTIONS: ReadonlyMap<string, Pick<OrderNode, 'direction' | 'nulls'>> = new Map([
  ['ASC', { direction: 'ASC' }],
  ['DESC', { direction: 'DESC' }],
  ['ASC NULLS FIRST', { direction: 'ASC', nulls: 'FIRST' }],
  ['ASC NULLS LAST', { direction: 'ASC', nulls: 'LAST' }],
  ['DESC NULLS FIRST', { direction: 'DESC', nulls: 'FIRST' }],
  ['DESC NULLS LAST', { direction: 'DESC', nulls: 'LAST' }],
  ['NULLS FIRST', { nulls: 'FIRST' }],
  ['NULLS LAST', { nulls: 'LAST' }],
] as const);

/** Parses an order direction from the allowlist; throws for anything else. */
export const directionOf = (value: unknown): Pick<OrderNode, 'direction' | 'nulls'> => {
  const direction = DIRECTIONS.get(String(value).trim().toUpperCase());
  if (direction === undefined) {
    throw new Error(`Invalid order direction: ${String(value)}`);
  }
  return direction;
};
