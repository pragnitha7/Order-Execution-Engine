import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { enqueueOrder } from '../queue';
import { insertOrder } from '../db';
import { sendWsStatus } from '../ws/wsManager';

export default async function ordersRoutes(fastify: FastifyInstance) {
  fastify.post('/api/orders/execute', async (req, reply) => {
    const { tokenIn, tokenOut, amount, slippageTolerance } = req.body as any;

    if (!tokenIn || !tokenOut || !amount) {
      return reply.code(400).send({ error: 'tokenIn, tokenOut, amount required' });
    }

    const id = uuidv4();
    const order = {
      id,
      tokenIn,
      tokenOut,
      amount,
      slippageTolerance: slippageTolerance ?? 0.01,
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    };

    await insertOrder(order);
    await enqueueOrder(order);

    // Send basic response to HTTP client
    reply.send({
      orderId: id,
      message:
        'Open websocket to /api/orders/execute and send { "orderId": "<id>" } to bind for live updates'
    });

    // Kick initial WS status (if already connected)
    await sendWsStatus(id, { status: 'pending', meta: { queued: true } });
  });
}
