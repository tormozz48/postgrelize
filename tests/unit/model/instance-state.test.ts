import { describe, expect, it } from 'vitest';
import { InstanceState } from '../../../src/model/instance-state.ts';

describe('InstanceState.mark', () => {
  it('tracks changed names in first-marked order and unmarks them', () => {
    const state = new InstanceState();
    state.mark('b', true);
    state.mark('a', true);
    state.mark('b', true);
    expect([...state.changed]).toEqual(['b', 'a']);
    state.mark('b', false);
    expect([...state.changed]).toEqual(['a']);
    state.mark('missing', false);
    expect([...state.changed]).toEqual(['a']);
  });

  it('does not share changes between instances, also after reset', () => {
    const first = new InstanceState();
    const second = new InstanceState();
    first.mark('x', true);
    expect(second.changed.size).toBe(0);
    first.reset();
    first.mark('y', true);
    second.mark('z', false);
    expect([...first.changed]).toEqual(['y']);
    expect(new InstanceState().changed.size).toBe(0);
  });

  it('keeps a snapshot taken by a reader unchanged', () => {
    const state = new InstanceState();
    state.mark('a', true);
    const snapshot = [...state.changed];
    state.mark('b', true);
    expect(snapshot).toEqual(['a']);
  });
});
