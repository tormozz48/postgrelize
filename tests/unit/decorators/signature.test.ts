import { describe, expect, it } from 'vitest';
import { DecoratorSignature } from '../../../src/decorators/decorator-signature.ts';

describe('DecoratorSignature', () => {
  const signature = new DecoratorSignature();
  class Target {
    readonly marker = 1;
  }
  const bag = {};

  it('reads the TC39 calling convention', () => {
    expect(
      signature.resolve([undefined, { kind: 'field', name: 'id', static: false, metadata: bag }]),
    ).toEqual({
      owner: bag,
      key: 'id',
      isStatic: false,
    });
    expect(
      signature.resolve([Target, { kind: 'class', name: 'Target', metadata: bag }]),
    ).toMatchObject({
      owner: bag,
      key: 'Target',
    });
    expect(() => signature.resolve([undefined, { kind: 'field', name: 'id' }])).toThrow(
      'Symbol.metadata',
    );
  });

  it('reads the legacy calling convention', () => {
    expect(signature.resolve([Target])).toEqual({ owner: Target, key: undefined, isStatic: false });
    expect(signature.resolve([Target.prototype, 'id'])).toEqual({
      owner: Target,
      key: 'id',
      isStatic: false,
    });
    expect(signature.resolve([Target, 'hook', {}])).toEqual({
      owner: Target,
      key: 'hook',
      isStatic: true,
    });
  });

  it('rejects anything else', () => {
    expect(() => signature.resolve([])).toThrow('Unsupported decorator usage');
  });
});
