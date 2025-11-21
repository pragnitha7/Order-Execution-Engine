const queryMock = jest.fn();

jest.mock('pg', () => {
  const PoolMock = jest.fn().mockImplementation(() => ({
    query: queryMock
  }));
  return { Pool: PoolMock };
});

import { updateOrderStatus } from '../src/db';

describe('updateOrderStatus', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('sets tx_hash when status is confirmed', async () => {
    await updateOrderStatus('order-1', 'confirmed', null, 'MOCKTX_123');

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];

    expect(sql).toMatch(/UPDATE orders/);
    expect(sql).toMatch(/tx_hash/);
    expect(sql).toMatch(/failure_reason/); // still present in your SQL
    expect(params).toEqual(['order-1', 'confirmed', null, 'MOCKTX_123']);
  });

  it('sets failure_reason when status is failed', async () => {
    await updateOrderStatus('order-2', 'failed', 'boom', null);

    const [sql, params] = queryMock.mock.calls[0];

    expect(sql).toMatch(/UPDATE orders/);
    expect(sql).toMatch(/failure_reason/);
    expect(sql).toMatch(/tx_hash/); // still present, but null in params
    expect(params).toEqual(['order-2', 'failed', 'boom', null]);
  });

  it('uses null for failure_reason and tx_hash for other statuses', async () => {
    await updateOrderStatus('order-3', 'routing', undefined, undefined);

    const [sql, params] = queryMock.mock.calls[0];

    // Your SQL always includes these columns
    expect(sql).toMatch(/failure_reason/);
    expect(sql).toMatch(/tx_hash/);

    // But for non-terminal statuses they are null in params
    expect(params).toEqual(['order-3', 'routing', null, null]);
  });
});
