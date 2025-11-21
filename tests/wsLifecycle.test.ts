import { sendWsStatus } from '../src/ws/wsManager';

test('sendWsStatus when no connection returns cleanly', async () => {
  await expect(sendWsStatus('nonexistent', { status: 'pending'})).resolves.toBeUndefined();
});
