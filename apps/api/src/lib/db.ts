import mongoose from 'mongoose';
import { logger } from '../logger';

export async function connectDb(uri: string) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info('MongoDB connected');
}
export const disconnectDb = () => mongoose.disconnect();
