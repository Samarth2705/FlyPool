// Entry point: connect to MongoDB first, then start listening.
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

try {
  await connectDB();
} catch (err) {
  console.error('Could not connect to MongoDB:', err.message);
  console.error('Check MONGODB_URI in server/.env and your Atlas Network Access (IP allow list).');
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`FlyPool API running at http://localhost:${env.port}/api`);
});
