import { down, up } from './stack.mjs';

export default async function setup() {
  if (process.env.E2E_REUSE) return; // run against an already-running stack (debugging)
  await up();
  return async () => { await down(); };
}
