// Entry point: start the API, then connect to MongoDB.
// The server stays up even if the database is temporarily unavailable -
// connectDB() keeps retrying, and /api/health shows the database status.
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

app.listen(env.port, () => {
  console.log(`FlyPool API running at http://localhost:${env.port}/api`);
});

connectDB();
