import { MockDexRouter } from '../src/services/dexRouter';

describe('MockDexRouter', () => {
  it('calls both Raydium and Meteora when routing', async () => {
    const router = new MockDexRouter();

    const raySpy = jest
      .spyOn(router as any, 'getRaydiumQuote')
      .mockResolvedValue({ price: 10, fee: 0.003 });
    const metSpy = jest
      .spyOn(router as any, 'getMeteoraQuote')
      .mockResolvedValue({ price: 9.5, fee: 0.002 });

    const result = await router.quoteAndRoute('SOL', 'USDC', 1);

    expect(raySpy).toHaveBeenCalledTimes(1);
    expect(metSpy).toHaveBeenCalledTimes(1);

    expect(result).toHaveProperty('chosen');
    expect(result).toHaveProperty('other');
    expect(result).toHaveProperty('decision');
  });

  it('chooses the better price as chosen and keeps the worse as other', async () => {
    const router = new MockDexRouter();

    // Raydium: 10, Meteora: 12
    jest
      .spyOn(router as any, 'getRaydiumQuote')
      .mockResolvedValue({ price: 10, fee: 0.003 });
    jest
      .spyOn(router as any, 'getMeteoraQuote')
      .mockResolvedValue({ price: 12, fee: 0.002 });

    const result: any = await router.quoteAndRoute('SOL', 'USDC', 1);

    // chosen should have the better (lower) price, other the worse
    expect(result.chosen.price).toBe(10);
    expect(result.other.price).toBe(12);

    // Both prices should come from the set of candidate prices
    expect([10, 12]).toContain(result.chosen.price);
    expect([10, 12]).toContain(result.other.price);

    // And they should not be the same
    expect(result.chosen.price).not.toBe(result.other.price);
  });

  it('executeSwap returns txHash and executedPrice', async () => {
    const router = new MockDexRouter();
    const order = {
      id: 'test-order',
      tokenIn: 'SOL',
      tokenOut: 'USDC',
      amount: 1,
      slippageTolerance: 0.01
    };

    const res = await router.executeSwap('Raydium', order as any);

    expect(res.txHash).toMatch(/MOCKTX_/);
    expect(typeof res.executedPrice).toBe('number');
  });
});
