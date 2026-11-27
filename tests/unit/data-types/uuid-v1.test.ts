import { describe, expect, it, vi } from 'vitest';
import { UuidV1 } from '../../../src/data-types/uuid-v1.ts';

const timeOf = (id: string): number => {
  const [low, mid, high] = id.split('-') as [string, string, string];
  const ticks = BigInt(`0x${high.slice(1)}${mid}${low}`);
  return Number((ticks - 122_192_928_000_000_000n) / 10_000n);
};

describe('UuidV1', () => {
  it('carries the time, a random multicast node and stays unique within a millisecond', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
    try {
      const generator = new UuidV1();
      const [first, second] = [generator.next(), generator.next()];
      expect(first).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(second).not.toBe(first);
      expect(timeOf(first)).toBe(Date.UTC(2026, 0, 1));
      expect(Number.parseInt(first.slice(24, 26), 16) & 1).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
