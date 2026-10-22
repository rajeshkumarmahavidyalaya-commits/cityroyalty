import { signupSchema } from '@cityroyalty/shared';
import { loadConfig } from '../src/config';
import { connectDb, disconnectDb, db } from '../src/db';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';

// usage: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin -w @cityroyalty/api
const config = loadConfig();
const parsed = signupSchema.safeParse({ name: process.env.ADMIN_NAME ?? 'Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
if (!parsed.success) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars, letters and numbers):', parsed.error.issues.map((i) => i.message).join('; '));
  process.exit(1);
}
connectDb(config.DATABASE_URL, { max: 1 });
const { name, email, password } = parsed.data;
const passwordHash = await hashPassword(password);
await db().insert(users).values({ email, name, role: 'admin', passwordHash }).onConflictDoUpdate({ target: users.email, set: { name, role: 'admin', passwordHash } });
console.log(`Admin ready: ${email}`);
await disconnectDb();
