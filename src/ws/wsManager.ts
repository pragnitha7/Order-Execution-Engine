import { FastifyInstance } from 'fastify';
import { OrderStatus } from '../types';

// Store active connections per orderId
type WsConn = { socket: any; orderId?: string };
const connections = new Map<string, Set<WsConn>>();

// Normalize any orderId we receive (strip whitespace and angle brackets)
function normalizeOrderId(raw: string): string {
  return raw.trim().replace(/^<|>$/g, '');
}

function bindConnection(orderIdRaw: string, socket: any) {
  const orderId = normalizeOrderId(orderIdRaw);
  console.log('[WS] bindConnection for orderId =', orderId);

  const set = connections.get(orderId) ?? new Set<WsConn>();
  set.add({ socket, orderId });
  connections.set(orderId, set);

  socket.send(
    JSON.stringify({
      orderId,
      status: 'pending',
      meta: { bound: true },
      ts: new Date().toISOString()
    })
  );
}

export async function registerWebsocketRoute(server: FastifyInstance) {
  server.get(
    '/api/orders/execute',
    { websocket: true },
    (socket: any, req: any) => {
      const query = (req.query || {}) as { orderId?: string };

      // OPTION 1: support ?orderId=... in URL
      if (query.orderId) {
        bindConnection(query.orderId, socket);
      }

      // OPTION 2: support JSON message { "orderId": "..." }
      socket.on('message', (msg: any) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data.orderId) {
            bindConnection(data.orderId, socket);
          }
        } catch (e) {
          console.warn('[WS] invalid message', e);
        }
      });

      socket.on('close', () => {
        console.log('[WS] socket closed, cleaning up');
        for (const [orderId, set] of connections) {
          for (const c of set) {
            if (c.socket === socket) {
              set.delete(c);
            }
          }
          if (set.size === 0) {
            connections.delete(orderId);
          }
        }
      });
    }
  );
}

export async function sendWsStatus(
  orderIdRaw: string,
  payload: { status: OrderStatus; meta?: any }
) {
  const orderId = normalizeOrderId(orderIdRaw);
  const set = connections.get(orderId);

  console.log(
    '[WS] sendWsStatus',
    'orderId =',
    orderId,
    'status =',
    payload.status,
    'hasConnections =',
    !!set
  );

  const msg = JSON.stringify({
    orderId,
    status: payload.status,
    meta: payload.meta || {},
    ts: new Date().toISOString()
  });

  if (!set) return;

  for (const c of set) {
    try {
      c.socket.send(msg);
    } catch (e) {
      console.warn('[WS] send failed', e);
    }
  }
}
export const __testInternals = {
  _connections: connections,
  _normalizeOrderId: normalizeOrderId
};