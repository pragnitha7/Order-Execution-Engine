import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  maxRetriesPerRequest: null
});

export const orderQueue = new Queue('orders', { connection });

export async function enqueueOrder(order: any) {
  await orderQueue.add('execute', order, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 500
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}
