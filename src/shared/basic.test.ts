import { describe, it, expect } from 'vitest';

describe('Basic test suite', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify TypeScript types work', () => {
    const value: string = 'test';
    expect(typeof value).toBe('string');
  });

  it('should test basic math operations', () => {
    expect(10 * 2).toBe(20);
    expect(100 / 4).toBe(25);
  });
});
