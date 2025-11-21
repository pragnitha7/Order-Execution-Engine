import { backoffDelay } from '../src/utils/retryBackoff';

describe('backoffDelay', () => {
  it('increases delay with attempts', () => {
    const d0 = backoffDelay(0);
    const d1 = backoffDelay(1);
    const d2 = backoffDelay(2);

    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('caps the delay at a reasonable max (if implemented)', () => {
    const d5 = backoffDelay(5);
    const d6 = backoffDelay(6);

    // Adjust if your implementation uses a different cap
    expect(d6).toBeLessThanOrEqual(d5);
  });
});
