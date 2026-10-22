import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/** One throwaway Postgres for the whole run; every test file creates its own database in it. */
export default async function setup() {
  const dir = path.join(tmpdir(), `cr-test-pg-${process.pid}`);
  const port = 55000 + (process.pid % 1000);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  process.env.TEST_PG_URL = `postgres://postgres:postgres@127.0.0.1:${port}`;
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
