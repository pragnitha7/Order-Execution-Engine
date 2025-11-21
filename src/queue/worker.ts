import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { MockDexRouter } from '../services/dexRouter';
import { updateOrderStatus } from '../db';
import { backoffDelay } from '../utils/retryBackoff';
import { sendWsStatus } from '../ws/wsManager';

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  maxRetriesPerRequest: null
});

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

const worker = new Worker(
  'orders',
  async (job: Job) => {
    const order = job.data;
    console.log('[WORKER] processing job', job.id, 'orderId =', order.id);

    // Give client time to open WS after POST
    console.log('[WORKER] initial delay before routing statuses');
    await sleep(8000); // 8 seconds to comfortably switch to WS

    const dex = new MockDexRouter();

    // routing
    await sendWsStatus(order.id, {
      status: 'routing',
      meta: { step: 'fetching quotes' }
    });
    await sleep(2000);

    // building
    const route = await dex.quoteAndRoute(
      order.tokenIn,
      order.tokenOut,
      order.amount
    );
    await sendWsStatus(order.id, {
      status: 'building',
      meta: { route }
    });
    await sleep(2000);

    // submitted
    await sendWsStatus(order.id, {
      status: 'submitted',
      meta: { dex: route.chosen.dex }
    });
    await sleep(2000);

    // confirmed / failed
    try {
      const execResult = await dex.executeSwap(route.chosen.dex, order);
      await updateOrderStatus(order.id, 'confirmed', null, execResult.txHash);
      await sendWsStatus(order.id, {
        status: 'confirmed',
        meta: {
          txHash: execResult.txHash,
          executedPrice: execResult.executedPrice
        }
      });
    } catch (err: any) {
      const attempts = job.attemptsMade || 0;
      console.error(
        '[WORKER] error processing',
        order.id,
        'attempt',
        attempts,
        err
      );

      if (attempts >= 3) {
        await updateOrderStatus(order.id, 'failed', String(err), null);
        await sendWsStatus(order.id, {
          status: 'failed',
          meta: { reason: String(err) }
        });
        throw err;
      } else {
        const delay = backoffDelay(attempts);
        await sendWsStatus(order.id, {
          status: 'pending',
          meta: { retryAttempt: attempts + 1, nextTryInMs: delay }
        });
        throw err;
      }
    }
  },
  { connection, concurrency: 10 }
);

worker.on('failed', (job, err) => {
  console.error('[WORKER] Job failed', job?.id, err);
});
