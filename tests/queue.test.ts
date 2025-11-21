import { orderQueue, enqueueOrder } from '../src/queue';

describe('enqueueOrder', () => {
  it('adds an execute job with retry options', async () => {
    const addMock = jest.fn().mockResolvedValue(undefined);
    // Override the real queue's add method so we don't hit Redis
    (orderQueue as any).add = addMock;

    const order = { id: 'o1', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1 };

    await enqueueOrder(order);

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      'execute',
      order,
      expect.objectContaining({
        attempts: 3,
        backoff: expect.objectContaining({ type: 'exponential' }),
        removeOnComplete: true,
        removeOnFail: false
      })
    );
  });

  it('returns a promise that resolves after adding the job', async () => {
    const addMock = jest.fn().mockResolvedValue('ok');
    (orderQueue as any).add = addMock;

    const order = { id: 'o2' };

    await expect(enqueueOrder(order)).resolves.toBeUndefined();
    expect(addMock).toHaveBeenCalledWith(
      'execute',
      order,
      expect.any(Object)
    );
  });
});
