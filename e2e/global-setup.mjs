import { down, up } from './stack.mjs';

export default async function setup() {
  await up();
  return async () => { await down(); };
}
