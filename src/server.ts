import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import ordersRoutes from './routes/orders';
import { registerWebsocketRoute } from './ws/wsManager';

// ✅ Start the worker in the same process
import './queue/worker';

const app = Fastify({
  logger: {
    level: 'info',
    // 👇 This overrides your real PC name in logs
    base: { hostname: 'pragnitha seggam' }
    // If you ever want to hide hostname & pid completely:
    // base: null
  }
});

app.register(websocket);

app.register(async (f) => {
  await ordersRoutes(f);
  await registerWebsocketRoute(f);
});

const PORT = Number(process.env.PORT || 3000);

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then((address) => {
    app.log.info(`Server listening at ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
