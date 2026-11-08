// Server status. Server side: server/src/routes/health.routes.js
import api, { unwrap } from './client';

// { status: 'ok', database: 'connected' | 'disconnected', uptimeSeconds }
export async function getHealth() {
  return unwrap(await api.get('/health'));
}
