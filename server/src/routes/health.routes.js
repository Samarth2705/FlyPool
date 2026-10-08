import { Router } from 'express';
import { isDBConnected } from '../config/db.js';

const router = Router();

// GET /api/health - quick check that the API and database are up.
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      database: isDBConnected() ? 'connected' : 'disconnected',
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});

export default router;
