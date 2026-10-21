// Artifact build only: hosts that cannot serve .glb files get the models as base64 modules, split into their own
// chunks so the second jacket is still loaded on demand.
const models = {
  biker: () => import('../assets/models/biker.glb'),
  women: () => import('../assets/models/women.glb'),
};

export async function readModel(loader, name) {
  const b64 = (await models[name]()).default;
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return loader.parseAsync(bytes.buffer, '');
}
