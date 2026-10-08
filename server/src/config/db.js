import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  await mongoose.connect(env.mongodbUri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

// Used by the health check route.
export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
