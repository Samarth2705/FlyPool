import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  // Give up after 10 seconds instead of hanging if Atlas can't be reached
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  // Log connection problems that happen later, while the server is running
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
}

// Used by the health check route.
export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
