// Persistent local MongoDB for development: `npm run dev:db -w @cityroyalty/api`, then MONGODB_URI=mongodb://127.0.0.1:27017/cityroyalty
import { mkdirSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

mkdirSync('.data/mongo', { recursive: true });
const m = await MongoMemoryServer.create({ instance: { port: 27017, dbPath: '.data/mongo', storageEngine: 'wiredTiger' } });
console.log(`MongoDB dev server running: ${m.getUri()}  (Ctrl+C to stop; data in apps/api/.data/mongo)`);
process.on('SIGINT', async () => {
  await m.stop();
  process.exit(0);
});
