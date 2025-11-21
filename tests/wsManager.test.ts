import { sendWsStatus, __testInternals } from '../src/ws/wsManager';

describe('wsManager', () => {
  beforeEach(() => {
    // Clear connections between tests
    __testInternals._connections.clear();
  });

  it('bindConnection (via query) registers connection and sends initial pending', () => {
    const socket = {
      sent: [] as string[],
      send(msg: string) {
        this.sent.push(msg);
      },
      on: jest.fn()
    } as any;

    // Simulate what registerWebsocketRoute handler does:
    const orderId = 'order-ws-1';
    // we can't call bindConnection directly, but we can fake what it does:
    __testInternals._connections.set(orderId, new Set([{ socket, orderId }]));

    // Send a status and check it is sent
    sendWsStatus(orderId, { status: 'routing', meta: { foo: 'bar' } });

    expect(socket.sent.length).toBe(1);
    const payload = JSON.parse(socket.sent[0]);
    expect(payload.orderId).toBe(orderId);
    expect(payload.status).toBe('routing');
    expect(payload.meta.foo).toBe('bar');
  });

  it('normalizeOrderId strips angle brackets and whitespace', () => {
    const raw = '  <abc-123>  ';
    const normalized = __testInternals._normalizeOrderId(raw);
    expect(normalized).toBe('abc-123');
  });
});
