import { hashPassword } from '../src/lib/auth';
import { connectDb, disconnectDb } from '../src/lib/db';
import { User } from '../src/models';
import { loadConfig } from '../src/config';
import { signupSchema } from '@cityroyalty/shared';

// usage: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin -w @cityroyalty/api
const config = loadConfig();
const parsed = signupSchema.safeParse({ name: process.env.ADMIN_NAME ?? 'Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
if (!parsed.success) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars, letters and numbers):', parsed.error.issues.map((i) => i.message).join('; '));
  process.exit(1);
}
await connectDb(config.MONGODB_URI);
const { name, email, password } = parsed.data;
await User.updateOne({ email }, { $set: { name, role: 'admin', passwordHash: await hashPassword(password) }, $setOnInsert: { email } }, { upsert: true });
console.log(`Admin ready: ${email}`);
await disconnectDb();
