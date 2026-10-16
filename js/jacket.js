import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

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
    url: 'assets/models/biker.glb',
    // vertical shoulder cut at |x| = px (tilted by `ang` degrees); `arm` = how far the sleeves point below horizontal
    cut: { px: 0.15, ang: 0 },
    arm: 36,
  },
  women: {
    url: 'assets/models/women.glb',
    cut: { px: 0.15, ang: 0 },
    arm: 34,
  },
};

/* ---------------- geometry helpers ---------------- */

/** clip a triangle mesh by a plane; returns [positiveSide, negativeSide] geometries (cut edge is exact, attributes interpolated) */
function clipByPlane(source, normal, d) {
  const geo = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(geo.attributes);
  const sizes = names.map((n) => geo.attributes[n].itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0);
  const posOff = sizes.slice(0, names.indexOf('position')).reduce((a, b) => a + b, 0); // attribute order differs per exporter
  const count = geo.attributes.position.count;
  const flat = new Float32Array(count * stride);
  for (let i = 0; i < count; i++) {
    let o = i * stride;
    names.forEach((n, k) => {
      const a = geo.attributes[n];
      for (let c = 0; c < sizes[k]; c++) flat[o++] = a.getComponent(i, c);
    });
  }
  const dist = (v) => normal.x * v[posOff] + normal.y * v[posOff + 1] + normal.z * v[posOff + 2] - d;
  const pos = [], neg = [];
  const get = (i) => flat.subarray(i * stride, i * stride + stride);
  const lerpV = (a, b, t) => { const o = new Float32Array(stride); for (let k = 0; k < stride; k++) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
  const clip = (poly, keepPositive) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = dist(a), db = dist(b);
      const ina = keepPositive ? da >= 0 : da <= 0, inb = keepPositive ? db >= 0 : db <= 0;
      if (ina) out.push(a);
      if (ina !== inb) out.push(lerpV(a, b, da / (da - db)));
    }
    return out;
  };
  for (let t = 0; t < count; t += 3) {
    const tri = [get(t), get(t + 1), get(t + 2)];
    const ds = tri.map(dist);
    if (ds.every((x) => x >= 0)) pos.push(...tri);
    else if (ds.every((x) => x <= 0)) neg.push(...tri);
    else {
      for (const [poly, out] of [[clip(tri, true), pos], [clip(tri, false), neg]]) {
        for (let i = 1; i < poly.length - 1; i++) out.push(poly[0], poly[i], poly[i + 1]);
      }
    }
  }
  const build = (verts) => {
    const g = new THREE.BufferGeometry();
    let o = 0;
    names.forEach((n, k) => {
      const arr = new Float32Array(verts.length * sizes[k]);
      verts.forEach((v, i) => { for (let c = 0; c < sizes[k]; c++) arr[i * sizes[k] + c] = v[o + c]; });
      o += sizes[k];
      g.setAttribute(n, new THREE.BufferAttribute(arr, sizes[k]));
    });
    const nrm = g.attributes.normal;
    if (nrm) for (let i = 0; i < nrm.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(nrm, i).normalize(); nrm.setXYZ(i, v.x, v.y, v.z); }
    return g;
  };
  return [build(pos), build(neg)];
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
  const g = new THREE.BufferGeometry();
  const tris = nonIndexed.attributes.position.count / 3;
  for (const name of Object.keys(nonIndexed.attributes)) {
    const a = nonIndexed.attributes[name], s = a.itemSize, out = [];
    for (let t = 0; t < tris; t++) {
      if (!pick(t)) continue;
      for (let v = 0; v < 3; v++) for (let c = 0; c < s; c++) out.push(a.getComponent(t * 3 + v, c));
    }
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(out), s));
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
  const gltf = await loader.loadAsync(cfg.url);
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
  const uniforms = {
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
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uAvg;\nuniform vec3 uLining;')
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        float leatherMask = 1.0 - smoothstep(0.25, 0.65, metalnessFactor);
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 recol = uTint * clamp(pow(lum / uAvg, 0.3), 0.6, 1.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, recol, leatherMask);
        if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, uLining, leatherMask);`
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

export async function loadJackets({ maxAniso = 8, onProgress } = {}) {
  const loader = new GLTFLoader();
  const models = {};
  const names = Object.keys(CONFIG);
  let done = 0;
  for (const n of names) {
    models[n] = await buildModel(n, loader, maxAniso);
    onProgress?.(++done / names.length);
  }
  const root = new THREE.Group();
  names.forEach((n) => root.add(models[n].group));
  let active = 'biker';
  names.forEach((n) => { models[n].group.scale.setScalar(n === active ? 1 : 0.0001); models[n].group.visible = n === active; });
  let explode = 0;

  return {
    root,
    models,
    get active() { return models[active]; },
    setModel(n) { if (models[n]) active = n; },
    setColor(hex) { names.forEach((n) => models[n].target.set(hex)); },
    setRough(v) { names.forEach((n) => (models[n].rough = v)); },
    explode(v) { explode = v; },
    focus(name) { return models[active].focus[name] || models[active].focus.full; },
    /** world position of a named feature ('zip', 'collar', 'cuff') or part ('body', 'sleeveL', 'sleeveR', 'hardware') */
    anchor(name) {
      const m = models[active];
      if (m.partCenters[name]) return m.parts[name].localToWorld(m.partCenters[name].clone());
      return m.group.localToWorld((m.focus[name] || m.focus.full).clone());
    },
    update(dt) {
      for (const n of names) {
        const m = models[n];
        const k = 1 - Math.exp(-dt * 7);
        m.uniforms.uTint.value.lerp(m.target, 1 - Math.exp(-dt * 6));
        const s = m.group.scale.x + ((n === active ? 1 : 0.0001) - m.group.scale.x) * k;
        m.group.scale.setScalar(Math.max(0.0001, s));
        m.group.visible = s > 0.02;
        m.setExplode(explode);
        m.material.normalScale.setScalar(THREE.MathUtils.lerp(m.material.normalScale.x, 1 + m.rough * 0.8, k));
      }
    },
  };
}
