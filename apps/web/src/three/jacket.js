// @ts-nocheck — engine ported unchanged from apps/showcase (plain JS, tested there)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const readModel = (loader, _name, url) => loader.loadAsync(url);

/* ------------------------------------------------------------------ *
 *  Real 3D leather jackets (glTF), prepared at load time:
 *   - normalised to a common size and centred
 *   - leather is recoloured live (hardware is masked out via the metalness map)
 *   - sleeves are cleanly cut at the shoulder so they can fly off for the
 *     "anatomy" view; hardware meshes are kept as their own floating layer
 *
 *  Models (CC-BY 4.0, see README / footer for credits):
 *   biker.glb  "Leather Biker Jacket" by Sigil0fSaturn
 *   women.glb  "Leather Jacket" by Zoe McCue
 * ------------------------------------------------------------------ */

const WIDTH = 0.9; // normalised arm-span of every model

const CONFIG = {
  biker: {
    url: '/models/biker.glb',
    // vertical shoulder cut at |x| = px (tilted by `ang` degrees); `arm` = how far the sleeves point below horizontal
    cut: { px: 0.15, ang: 0 },
    arm: 36,
  },
  women: {
    url: '/models/women.glb',
    cut: { px: 0.15, ang: 0 },
    arm: 34,
  },
};

/* ---------------- fine leather grain (detail normal map) ---------------- */

/** Periodic Voronoi "pebble" height field converted to a tangent-space normal map (RGBA bytes).
 *  Deliberately self-contained: it is serialised into a Web Worker (see grainData) so it never blocks the page. */
function computeGrain(size, cells) {
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      px[j * cells + i] = i + 0.12 + Math.random() * 0.76;
      py[j * cells + i] = j + 0.12 + Math.random() * 0.76;
    }
  }
  const h = new Float32Array(size * size), cs = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cs, gy = y / cs, cx = Math.floor(gx), cy = Math.floor(gy);
      let d1 = 9, d2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (((cx + ox) % cells) + cells) % cells, iy = (((cy + oy) % cells) + cells) % cells;
          const k = iy * cells + ix;
          const dx = gx - (px[k] + cx + ox - ix), dy = gy - (py[k] + cy + oy - iy);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      const e = d1 * 1.2;
      const pebble = Math.max(0, 1 - e * e);
      const groove = Math.min(1, (d2 - d1) * 3.4);
      h[y * size + x] = pebble * (0.4 + 0.6 * groove) + (Math.random() - 0.5) * 0.05;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const m = size - 1; // size is a power of two: wrap with a mask
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h[y * size + ((x + 1) & m)] - h[y * size + ((x - 1) & m)]) * 2.4;
      const dy = (h[((y + 1) & m) * size + x] - h[((y - 1) & m) * size + x]) * 2.4;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4;
      data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

const GRAIN_SIZE = 512;
let grainPromise = null;
/** start generating the grain on a worker thread (falls back to the main thread); resolves to RGBA bytes */
function grainData() {
  if (grainPromise) return grainPromise;
  grainPromise = new Promise((resolve) => {
    const inline = () => resolve(computeGrain(GRAIN_SIZE, 40));
    try {
      const src = `self.onmessage=(e)=>{const r=(${computeGrain.toString()})(e.data[0],e.data[1]);self.postMessage(r,[r.buffer])}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      const done = () => { w.terminate(); URL.revokeObjectURL(url); };
      w.onmessage = (e) => { done(); resolve(e.data); };
      w.onerror = () => { done(); inline(); };
      w.postMessage([GRAIN_SIZE, 40]);
    } catch (err) {
      inline();
    }
  });
  return grainPromise;
}
grainData(); // kick off at import time: it runs while the model downloads

let grainTex = null;
async function getGrain(maxAniso) {
  if (grainTex) return grainTex;
  const tex = new THREE.DataTexture(await grainData(), GRAIN_SIZE, GRAIN_SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return (grainTex = tex);
}

/* ---------------- geometry helpers ---------------- */

/** Clip a triangle mesh by a plane; returns [positiveSide, negativeSide] geometries (the cut edge is exact,
 *  every vertex attribute is interpolated). Works on one interleaved Float32Array: no per-vertex allocations. */
function clipByPlane(source, normal, d) {
  const geo = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(geo.attributes);
  const attrs = names.map((n) => geo.attributes[n]);
  const sizes = attrs.map((a) => a.itemSize);
  const offs = [];
  let stride = 0;
  sizes.forEach((sz) => { offs.push(stride); stride += sz; });
  const posOff = offs[names.indexOf('position')]; // attribute order differs per exporter
  const n = geo.attributes.position.count;

  const flat = new Float32Array(n * stride);
  attrs.forEach((a, k) => {
    const sz = sizes[k], off = offs[k], arr = a.array;
    if (arr instanceof Float32Array && !a.isInterleavedBufferAttribute) {
      for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) flat[i * stride + off + c] = arr[i * sz + c];
    } else {
      for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) flat[i * stride + off + c] = a.getComponent(i, c);
    }
  });

  const nx = normal.x, ny = normal.y, nz = normal.z;
  const dist = (v) => nx * flat[v * stride + posOff] + ny * flat[v * stride + posOff + 1] + nz * flat[v * stride + posOff + 2] - d;
  // a triangle cut by a plane gives at most 4 vertices on either side
  const scratch = new Float32Array(4 * stride);
  const sinkPos = { buf: new Float32Array(n * 2 * stride), n: 0 }, sinkNeg = { buf: new Float32Array(n * 2 * stride), n: 0 };
  const copyVertex = (sink, from, fromIndex) => {
    const o = sink.n++ * stride, q = fromIndex * stride;
    for (let k = 0; k < stride; k++) sink.buf[o + k] = from[q + k];
  };
  const tri = [0, 0, 0], ds = [0, 0, 0];
  const clipSide = (sink, keepPositive) => {
    let m = 0;
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], da = ds[e], db = ds[(e + 1) % 3];
      const ina = keepPositive ? da >= 0 : da <= 0, inb = keepPositive ? db >= 0 : db <= 0;
      if (ina) { for (let k = 0; k < stride; k++) scratch[m * stride + k] = flat[a * stride + k]; m++; }
      if (ina !== inb) {
        const t = da / (da - db);
        for (let k = 0; k < stride; k++) scratch[m * stride + k] = flat[a * stride + k] + (flat[b * stride + k] - flat[a * stride + k]) * t;
        m++;
      }
    }
    for (let i = 1; i < m - 1; i++) { copyVertex(sink, scratch, 0); copyVertex(sink, scratch, i); copyVertex(sink, scratch, i + 1); }
  };
  for (let t = 0; t < n; t += 3) {
    tri[0] = t; tri[1] = t + 1; tri[2] = t + 2;
    ds[0] = dist(t); ds[1] = dist(t + 1); ds[2] = dist(t + 2);
    if (ds[0] >= 0 && ds[1] >= 0 && ds[2] >= 0) { for (let v = 0; v < 3; v++) copyVertex(sinkPos, flat, t + v); }
    else if (ds[0] <= 0 && ds[1] <= 0 && ds[2] <= 0) { for (let v = 0; v < 3; v++) copyVertex(sinkNeg, flat, t + v); }
    else { clipSide(sinkPos, true); clipSide(sinkNeg, false); }
  }

  const build = (sink) => {
    const g = new THREE.BufferGeometry();
    names.forEach((name, k) => {
      const sz = sizes[k], off = offs[k], arr = new Float32Array(sink.n * sz);
      for (let i = 0; i < sink.n; i++) for (let c = 0; c < sz; c++) arr[i * sz + c] = sink.buf[i * stride + off + c];
      if (name === 'normal') {
        for (let i = 0; i < sink.n; i++) {
          const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2], l = 1 / (Math.hypot(x, y, z) || 1);
          arr[i * 3] = x * l; arr[i * 3 + 1] = y * l; arr[i * 3 + 2] = z * l;
        }
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    });
    return g;
  };
  return [build(sinkPos), build(sinkNeg)];
}

/** triangle -> connected component id (by shared vertex index) */
function triangleComponents(geo) {
  const idx = geo.index.array, N = geo.attributes.position.count;
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]); parent[find(idx[i + 1])] = a; parent[find(idx[i + 2])] = a; }
  const comp = new Int32Array(idx.length / 3);
  for (let t = 0; t < comp.length; t++) comp[t] = find(idx[t * 3]);
  return comp;
}

/** keep only triangles for which pick(triangleIndex) is true (works on non-indexed copies) */
function pickTriangles(nonIndexed, pick) {
  const tris = nonIndexed.attributes.position.count / 3;
  const keep = [];
  for (let t = 0; t < tris; t++) if (pick(t)) keep.push(t);
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(nonIndexed.attributes)) {
    const a = nonIndexed.attributes[name], sz = a.itemSize, out = new Float32Array(keep.length * 3 * sz);
    let o = 0;
    for (const t of keep) for (let v = 0; v < 3; v++) for (let c = 0; c < sz; c++) out[o++] = a.getComponent(t * 3 + v, c);
    g.setAttribute(name, new THREE.BufferAttribute(out, sz));
  }
  return g;
}

/** robust "typical" luminance of a texture (median, linear light) */
function medianLuminance(tex) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(tex.image, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data, L = [];
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
    L.sort((a, b) => a - b);
    return Math.max(0.004, L[Math.floor(L.length * 0.5)]);
  } catch (e) {
    return 0.03;
  }
}

/* ---------------- model builder ---------------- */

async function buildModel(name, loader, maxAniso) {
  const cfg = CONFIG[name];
  performance.mark('cr:model-' + name + '-start');
  const gltf = await readModel(loader, name, cfg.url);
  gltf.scene.updateMatrixWorld(true);

  // bake transforms, gather meshes
  const meshes = [];
  gltf.scene.traverse((n) => {
    if (n.isMesh) meshes.push({ geo: n.geometry.clone().applyMatrix4(n.matrixWorld), mat: n.material });
  });
  // normalise: centre + scale to WIDTH
  const box = new THREE.Box3();
  meshes.forEach((m) => { m.geo.computeBoundingBox(); box.union(m.geo.boundingBox); });
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const k = WIDTH / size.x;
  meshes.forEach((m) => {
    m.geo.translate(-centre.x, -centre.y, -centre.z);
    m.geo.scale(k, k, k);
    m.geo.computeBoundingBox();
  });

  // leather = the mesh with the most triangles (the biker has separate hardware meshes)
  const tri = (m) => (m.geo.index ? m.geo.index.count : m.geo.attributes.position.count) / 3;
  meshes.sort((a, b) => tri(b) - tri(a));
  const leather = meshes[0], hardware = meshes.slice(1);

  /* --- materials --- */
  const base = leather.mat;
  [base.map, base.normalMap, base.metalnessMap, base.aoMap].forEach((t) => t && (t.anisotropy = maxAniso));
  performance.mark('cr:model-' + name + '-parsed');
  const grain = await getGrain(maxAniso);
  performance.mark('cr:grain-' + name);
  const uniforms = {
    uGrain: { value: grain },
    uGrainScale: { value: cfg.grainScale ?? 24.0 },
    uGrainAmt: { value: cfg.grainAmt ?? 0.32 },
    uTint: { value: new THREE.Color(0x4a2716) },
    uAvg: { value: medianLuminance(base.map) },
    uLining: { value: new THREE.Color(0x15100d) },
  };
  const leatherMat = base.clone();
  leatherMat.roughness = 1.22; // slightly softer sheen: real hide, not patent
  leatherMat.envMapIntensity = 0.9;
  leatherMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uAvg;\nuniform vec3 uLining;\nuniform sampler2D uGrain;\nuniform float uGrainScale;\nuniform float uGrainAmt;')
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        float leatherMask = 1.0 - smoothstep(0.25, 0.65, metalnessFactor);
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 recol = uTint * clamp(pow(lum / uAvg, 0.22), 0.7, 1.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, recol, leatherMask);
        // keep the hide from looking wet: floor the baked roughness on leather
        roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.36), leatherMask);
        if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, uLining, leatherMask);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          // fine hide grain layered over the baked 1024px normal map (keeps close-ups crisp)
          vec3 gN = texture2D( uGrain, vNormalMapUv * uGrainScale ).xyz * 2.0 - 1.0;
          mapN = normalize( vec3( mapN.xy + gN.xy * uGrainAmt * leatherMask, mapN.z ) );
          normal = normalize( tbn * mapN );
        #else
          #include <normal_fragment_maps>
        #endif`
      );
  };
  leatherMat.customProgramCacheKey = () => 'cr-leather-' + name;
  const hardwareMat = base.clone();
  hardwareMat.side = THREE.DoubleSide;

  /* --- cut planes (right arm +x, left arm -x) --- */
  const a = THREE.MathUtils.degToRad(cfg.cut.ang);
  const dirR = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0);
  const dirL = new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0);
  const dR = cfg.cut.px, dL = cfg.cut.px;
  const arm = THREE.MathUtils.degToRad(cfg.arm);
  const armR = new THREE.Vector3(Math.cos(arm), -Math.sin(arm), 0), armL = new THREE.Vector3(-Math.cos(arm), -Math.sin(arm), 0);

  const [sleeveRgeo, rest1] = clipByPlane(leather.geo, dirR, dR);
  const [sleeveLgeo, bodyGeo] = clipByPlane(rest1, dirL, dL);

  const mk = (g, m) => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; return me; };
  const parts = { body: new THREE.Group(), sleeveL: new THREE.Group(), sleeveR: new THREE.Group(), hardware: new THREE.Group() };
  parts.body.add(mk(bodyGeo, leatherMat));
  parts.sleeveR.add(mk(sleeveRgeo, leatherMat));
  parts.sleeveL.add(mk(sleeveLgeo, leatherMat));

  // hardware: whole components travel with the nearest part
  const side = (c) => (dirR.dot(c) >= dR ? 'sleeveR' : dirL.dot(c) >= dL ? 'sleeveL' : 'hardware');
  hardware.forEach((h) => {
    if (!h.geo.index) { parts.hardware.add(mk(h.geo, hardwareMat)); return; }
    const comp = triangleComponents(h.geo);
    const pos = h.geo.attributes.position, idx = h.geo.index.array;
    const acc = new Map();
    for (let t = 0; t < comp.length; t++) {
      const e = acc.get(comp[t]) || { s: new THREE.Vector3(), n: 0 };
      for (let v = 0; v < 3; v++) { e.s.x += pos.getX(idx[t * 3 + v]); e.s.y += pos.getY(idx[t * 3 + v]); e.s.z += pos.getZ(idx[t * 3 + v]); e.n++; }
      acc.set(comp[t], e);
    }
    const where = new Map();
    acc.forEach((e, id) => where.set(id, side(e.s.clone().divideScalar(e.n))));
    const ni = h.geo.toNonIndexed();
    for (const key of ['sleeveR', 'sleeveL', 'hardware']) {
      const g = pickTriangles(ni, (t) => where.get(comp[t]) === key);
      if (g.attributes.position.count) parts[key].add(mk(g, hardwareMat));
    }
  });

  performance.mark('cr:model-' + name + '-split');
  const group = new THREE.Group();
  Object.values(parts).forEach((p) => group.add(p));
  const partCenters = {};
  Object.entries(parts).forEach(([key, p]) => {
    const b = new THREE.Box3().setFromObject(p);
    partCenters[key] = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
  });

  /* --- focus points for the close-up camera moves --- */
  const lp = leather.geo.attributes.position;
  let maxY = -1e9;
  for (let i = 0; i < lp.count; i++) maxY = Math.max(maxY, lp.getY(i));
  const cAcc = new THREE.Vector3(); let nn = 0;
  for (let i = 0; i < lp.count; i++) {
    if (lp.getY(i) > maxY - 0.05 && Math.abs(lp.getX(i)) < 0.12) { cAcc.add(new THREE.Vector3().fromBufferAttribute(lp, i)); nn++; }
  }
  const collar = nn ? cAcc.divideScalar(nn) : new THREE.Vector3(0, maxY, 0.05);
  let zip = new THREE.Vector3(0.02, 0.0, 0.1);
  hardware.forEach((h) => {
    const b = h.geo.boundingBox, s = b.getSize(new THREE.Vector3());
    if (s.y > 0.25 && s.x < 0.15) zip = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - s.y * 0.3, b.max.z);
  });
  let cuff = new THREE.Vector3(0.38, -0.1, 0.06);
  {
    const sp = sleeveRgeo.attributes.position, c = new THREE.Vector3(); let m = 0, maxX = -1e9;
    for (let i = 0; i < sp.count; i++) maxX = Math.max(maxX, sp.getX(i));
    for (let i = 0; i < sp.count; i++) if (sp.getX(i) > maxX - 0.05) { c.add(new THREE.Vector3().fromBufferAttribute(sp, i)); m++; }
    if (m) cuff = c.divideScalar(m);
  }
  const focus = { full: new THREE.Vector3(), zip, collar: collar.clone().add(new THREE.Vector3(0, -0.04, 0.03)), cuff };

  /* --- exploded view --- */
  const home = {};
  Object.entries(parts).forEach(([key, p]) => (home[key] = p.position.clone()));
  const exploded = {
    body: { p: [0, 0, 0], r: 0 },
    sleeveR: { p: [armR.x * 0.26, armR.y * 0.26 + 0.04, 0.02], r: -0.05 },
    sleeveL: { p: [armL.x * 0.26, armL.y * 0.26 + 0.04, 0.02], r: 0.05 },
    hardware: { p: [0, 0.02, 0.3], r: 0 },
  };
  const setExplode = (e) => {
    for (const key in parts) {
      const t = exploded[key];
      parts[key].position.set(home[key].x + t.p[0] * e, home[key].y + t.p[1] * e, home[key].z + t.p[2] * e);
      parts[key].rotation.z = t.r * e;
    }
  };

  return { name, group, parts, focus, partCenters, uniforms, material: leatherMat, setExplode, target: new THREE.Color(0x4a2716), rough: 0 };
}

/* ---------------- public API ---------------- */

/** Loads the first jacket now; the others load on demand (setModel) or in idle time (preload), so the first
 *  paint does not wait for models the visitor may never pick. */
export async function loadJackets({ maxAniso = 8, onProgress, first = 'biker' } = {}) {
  const loader = new GLTFLoader();
  const models = {};
  const loading = {};
  const root = new THREE.Group();
  let active = first, wanted = first;
  let colour = null, rough = 0, explode = 0;

  const load = (n) => (loading[n] ||= buildModel(n, loader, maxAniso).then((m) => {
    models[n] = m;
    if (colour !== null) { m.target.set(colour); m.uniforms.uTint.value.copy(m.target); } // start in the current colour
    m.rough = rough;
    m.group.scale.setScalar(n === wanted ? 1 : 0.0001);
    m.group.visible = n === wanted;
    root.add(m.group);
    if (wanted === n) active = n;
    return m;
  }));

  await load(first);
  onProgress?.(1);

  return {
    root,
    models,
    get active() { return models[active]; },
    /** switch to a jacket; if it is still loading, the current one stays until it arrives */
    setModel(n) { if (!CONFIG[n]) return; wanted = n; if (models[n]) active = n; else load(n); },
    /** fetch a jacket in the background (resolves when it is built) */
    preload(n) { return load(n); },
    setColor(hex) { colour = hex; for (const n in models) models[n].target.set(hex); },
    setRough(v) { rough = v; for (const n in models) models[n].rough = v; },
    explode(v) { explode = v; },
    /** compile every shader and upload every texture now, so switching jackets mid-scroll never hitches */
    warmUp(renderer, scene, camera) {
      const loaded = Object.keys(models);
      const was = loaded.map((n) => models[n].group.visible);
      loaded.forEach((n) => { models[n].group.visible = true; });
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      loaded.forEach((n, i) => { models[n].group.visible = was[i]; });
    },
    focus(name) { return models[active].focus[name] || models[active].focus.full; },
    /** world position of a named feature ('zip', 'collar', 'cuff') or part ('body', 'sleeveL', 'sleeveR', 'hardware') */
    anchor(name) {
      const m = models[active];
      if (m.partCenters[name]) return m.parts[name].localToWorld(m.partCenters[name].clone());
      return m.group.localToWorld((m.focus[name] || m.focus.full).clone());
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 7), kc = 1 - Math.exp(-dt * 6);
      for (const n in models) {
        const m = models[n];
        m.uniforms.uTint.value.lerp(m.target, kc);
        const s = m.group.scale.x + ((n === active ? 1 : 0.0001) - m.group.scale.x) * k;
        m.group.scale.setScalar(Math.max(0.0001, s));
        m.group.visible = s > 0.02;
        m.setExplode(explode);
        m.material.normalScale.setScalar(THREE.MathUtils.lerp(m.material.normalScale.x, 1 + m.rough * 0.8, k));
      }
    },
  };
}
