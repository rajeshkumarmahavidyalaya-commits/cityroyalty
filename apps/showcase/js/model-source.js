// How a jacket model is read. The normal build fetches the .glb over HTTP (and it is preloaded from the HTML).
// The artifact build swaps this file for model-source.embedded.js (see tools/build.mjs).
export const readModel = (loader, name, url) => loader.loadAsync(url);
