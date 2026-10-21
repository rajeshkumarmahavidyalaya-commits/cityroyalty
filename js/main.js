import * as THREE from 'three';
import { buildStudioEnvironment, addStudioLights } from './studio.js';
import { loadJackets } from './jacket.js';
import { initRing } from './carousel.js';
import { products, belt, categories, formatINR, SALE_ENDS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// real anchor click: works in sandboxed frames where window.open is blocked
function openUrl(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ------------------------------------------------------------------ *
 *  Poses: where the 3D jacket sits for each scroll section.
 *  x is a fraction of the visible half-width, y/fx/fy/fz in world/model units,
 *  s scale, ry/rx/rz rotation, ex = exploded amount, snow = particle mode.
 * ------------------------------------------------------------------ */
const P = (o) => ({ x: 0, y: 0, s: 1, ry: 0, rx: 0, rz: 0, ex: 0, fx: 0, fy: 0, fz: 0, snow: 0, abs: 0, lk: 0, f: '', ...o });
const POSES = {
  hero:  P({ x: 0.32, y: 0.02, s: 1.8, ry: -0.3, rx: 0.04 }),
  story: P({ x: 0.52, y: 0.0, s: 1.5, ry: -0.75, rz: 0.06 }),
  a0:    P({ x: 0.4, y: 0.0, s: 1.7, ry: -0.45 }),
  a1:    P({ x: 0.52, y: 0.0, s: 2.5, ry: -0.2, f: 'zip' }),
  a2:    P({ x: 0.5, y: 0.0, s: 2.7, ry: 0.3, f: 'collar' }),
  a3:    P({ x: 0.3, y: 0.0, s: 1.4, ry: 0.28, rx: 0.05, ex: 1.0 }),
  colours: P({ x: 0.0, y: 0.04, s: 1.6, ry: 0.0 }),
  sale:  P({ x: -0.5, y: 0.0, s: 1.55, ry: 0.8, rz: -0.07, snow: 1 }),
  away:  P({ x: 0.0, y: -0.2, s: 0.0001, ry: 1.2 }),
};
// Phone (portrait) poses. The jacket stays pinned in the upper ~45% of the screen, big enough to bleed past the
// screen edges, while the text rides up underneath it. abs:1 = values are used as-is (no landscape adjustments).
const PY = 0.43;
const PP = (o) => P({ x: 0, y: PY, abs: 1, ...o });
const POSES_P = {
  hero:  PP({ y: 0.4, s: 1.28, ry: -0.35, rx: 0.04 }),
  story: PP({ s: 1.2, ry: -0.2, rz: 0.04 }),
  a0:    PP({ s: 1.2, ry: -0.4 }),
  a1:    PP({ y: 0.5, s: 1.95, ry: -0.2, f: 'zip' }),
  a2:    PP({ y: 0.5, s: 2.05, ry: 0.3, f: 'collar' }),
  a3:    PP({ y: 0.42, s: 0.72, ry: 0.28, rx: 0.05, ex: 1.0 }),
  colours: PP({ s: 1.3 }),
  sale:  PP({ s: 1.2, ry: 0.5, rz: -0.04, snow: 1 }),
  away:  PP({ y: 0.2, s: 0.0001, ry: 1.2 }),
};
const TRACKS = { anatomy: ['a0', 'a1', 'a2', 'a3'] };
const KEYS = ['x', 'y', 's', 'ry', 'rx', 'rz', 'ex', 'fx', 'fy', 'fz', 'snow', 'abs', 'lk'];
const mixPose = (a, b, t) => {
  const o = {};
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  // shrink out in the first half of a hand-off and grow in during the second half, so the jacket never
  // lingers as a small floating copy while it travels between sections
  if (b.s < 0.01 && a.s >= 0.01) o.s = a.s + (b.s - a.s) * clamp(t * 2);
  else if (a.s < 0.01 && b.s >= 0.01) o.s = a.s + (b.s - a.s) * clamp(t * 2 - 1);
  return o;
};

/* ------------------------------------------------------------------ *
 *  Boot the main scene
 * ------------------------------------------------------------------ */
const canvas = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: false, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL unavailable, using static fallback', e);
  document.documentElement.classList.add('no-webgl');
}

const loaderBar = $('#loaderBar');
const setProgress = (v) => { if (loaderBar) loaderBar.style.width = Math.round(v * 100) + '%'; };
setProgress(0.15);

let jacket, rig, scene, camera, dust;
const state = { yaw: 0, vel: 0, dragging: false, mx: 0, my: 0, sx: 0, sy: 0, section: 'hero', stepF: 0, cleared: false };

if (renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.02, 3.6);

  scene.environment = buildStudioEnvironment(renderer);
  scene.environmentIntensity = 1.8;
  addStudioLights(scene);
  const warm = new THREE.PointLight(0xffe2b8, 1.0, 8);
  warm.position.set(1.5, -0.4, 2.2);
  scene.add(warm);
  setProgress(0.4);

  jacket = await loadJackets({
    maxAniso: renderer.capabilities.getMaxAnisotropy(),
    onProgress: (v) => setProgress(0.4 + v * 0.5),
  });
  rig = new THREE.Group();
  rig.add(jacket.root);
  scene.add(rig);
  jacket.setColor(products[0].color);
  jacket.update(10);
  setProgress(0.92);

  // dust motes (gold) that turn into snow in the winter section
  const COUNT = innerWidth < 700 ? 320 : 650;
  const dPos = new Float32Array(COUNT * 3), dSeed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    dPos[i * 3] = (Math.random() - 0.5) * 7;
    dPos[i * 3 + 1] = (Math.random() - 0.5) * 4.4;
    dPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 0.5;
    dSeed[i] = Math.random();
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const dMat = new THREE.PointsMaterial({ size: 0.045, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: 0xc9a24b, opacity: 0.4, sizeAttenuation: true });
  dust = new THREE.Points(dGeo, dMat);
  dust.userData = { seed: dSeed };
  scene.add(dust);
}

/* ------------------------------------------------------------------ *
 *  Section bookkeeping
 * ------------------------------------------------------------------ */
const sections = $$('main > section');
const themed = [...sections, $('.footer')];
const poseSections = sections.filter((s) => s.dataset.pose || s.dataset.track);
const steps = $$('.step');
const nav = $('#nav');
const progressEl = $('#progress'), wordmark = $('.hero__wordmark');

/* ------------------------------------------------------------------ *
 *  Layout cache.
 *  Reading element rects every frame forces the browser to recalculate layout while the
 *  page is scrolling. Instead everything is measured once (in document coordinates) and
 *  re-measured only when the layout can have changed; the frame loop only reads scrollY.
 * ------------------------------------------------------------------ */
const L = { sections: [], themed: [], steps: [], anchors: new Map(), cw: innerWidth, ch: innerHeight, docH: 1, dirty: true };
function measure() {
  L.dirty = false;
  const sy = scrollY;
  const doc = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + sy, bottom: r.bottom + sy, left: r.left, width: r.width, height: r.height }; };
  L.docH = document.documentElement.scrollHeight;
  L.sections = poseSections.map(doc);
  L.themed = themed.map(doc);
  L.steps = steps.map((e) => { const r = doc(e); return r.top + r.height / 2; });
  L.anchors.clear();
  poseSections.forEach((el) => { const a = el.dataset.anchor && $(el.dataset.anchor, el); if (a) L.anchors.set(el, doc(a)); });
}
const invalidate = () => { L.dirty = true; };
addEventListener('load', invalidate);
document.fonts?.ready.then(invalidate);
new ResizeObserver(invalidate).observe(document.body);

// Sections can pin the jacket to an element (data-anchor): it is centred on that element and
// scaled to fit it, so the HTML layout and the 3D pose can never drift apart.
const JACKET_H = 0.5, JACKET_W = 0.9, JACKET_W_PHONE = 0.7; // on phones the sleeves may bleed past the stage edges
function anchored(el, pose) {
  const r = L.anchors.get(el);
  if (!r || !camera) return pose;
  const sy = scrollY, vw = L.cw, vh = L.ch;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const halfW = halfH * (vw / vh);
  const cy = r.top - sy + r.height / 2;
  const y = clamp(((vh / 2 - cy) / (vh / 2)) * halfH, -halfH * 1.7, halfH * 1.7);
  const x = (r.left + r.width / 2 - vw / 2) / (vw / 2);
  const sc = Math.min(((r.height / vh) * 2 * halfH) / JACKET_H, ((r.width / vw) * 2 * halfW) / (vw / vh < 0.95 ? JACKET_W_PHONE : JACKET_W));
  return { ...pose, y, x, s: sc, abs: 1, lk: 1 };
}
// close-up poses name a part of the jacket ('zip', 'collar'); resolve it for whichever model is showing
function withFocus(pose) {
  if (!pose.f || !jacket) return pose;
  const v = jacket.focus(pose.f);
  return { ...pose, fx: v.x, fy: v.y, fz: v.z };
}
const isPortrait = () => L.cw / L.ch < 0.95;
function sectionKeys(el) {
  const table = isPortrait() ? POSES_P : POSES;
  if (el.dataset.track) return TRACKS[el.dataset.track].map((k) => withFocus(table[k]));
  return [anchored(el, table[el.dataset.pose])];
}

function targetPose() {
  if (L.dirty) measure();
  const vh = innerHeight, vc = scrollY + vh * 0.5; // viewport centre in document coordinates
  const rects = L.sections;
  let idx = rects.findIndex((r) => r.top <= vc && r.bottom > vc);
  if (idx < 0) idx = vc < rects[0].top ? 0 : poseSections.length - 1;
  const el = poseSections[idx], keys = sectionKeys(el);
  state.section = el.id || 'hero';

  // pose inside the section (anatomy interpolates per step)
  let pose = keys[0];
  if (keys.length > 1) {
    const cs = L.steps;
    let f = 0;
    if (vc >= cs[cs.length - 1]) f = cs.length - 1;
    else if (vc > cs[0]) {
      const k = cs.findIndex((c, i) => vc >= c && vc < cs[i + 1]);
      f = k + (vc - cs[k]) / (cs[k + 1] - cs[k]);
    }
    const i = Math.min(keys.length - 2, Math.floor(f));
    pose = mixPose(keys[i], keys[i + 1], smooth(0.2, 0.8, f - i));
    if (state.stepF !== f) {
      state.stepF = f;
      steps.forEach((s, n) => s.classList.toggle('is-active', Math.abs(f - n) < 0.55));
    }
  }

  // slow scroll-linked turn: the jacket rotates while you read (data-spin = radians across the whole section)
  const spin = parseFloat(el.dataset.spin || 0);
  if (spin && !reduceMotion) {
    const u = clamp((vc - rects[idx].top) / (rects[idx].bottom - rects[idx].top));
    pose = { ...pose, ry: pose.ry + (u - 0.5) * spin };
  }

  // blend across the boundary with the neighbouring section
  const Z = vh * 0.45;
  const toNext = rects[idx].bottom - vc;
  if (idx < poseSections.length - 1 && toNext < Z) {
    const nk = sectionKeys(poseSections[idx + 1])[0];
    pose = mixPose(pose, nk, smooth(Z, 0, toNext));
  }
  const fromPrev = vc - rects[idx].top;
  if (idx > 0 && fromPrev < Z) {
    const pk = sectionKeys(poseSections[idx - 1]);
    pose = mixPose(pose, pk[pk.length - 1], smooth(Z, 0, fromPrev));
  }
  return pose;
}

function currentTheme() {
  const vc = scrollY + innerHeight * 0.5;
  for (let i = 0; i < L.themed.length; i++) {
    const r = L.themed[i];
    if (r.top <= vc && r.bottom > vc) return themed[i].dataset.theme || 'light';
  }
  return 'light';
}

/* ------------------------------------------------------------------ *
 *  Interaction: drag to rotate, pointer parallax
 * ------------------------------------------------------------------ */
$$('[data-drag]').forEach((el) => {
  let lastX = 0;
  el.addEventListener('pointerdown', (e) => { state.dragging = true; lastX = e.clientX; state.vel = 0; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    state.yaw += dx * 0.011; state.vel = dx * 0.011;
  });
  const up = () => { state.dragging = false; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
addEventListener('pointermove', (e) => { state.mx = (e.clientX / innerWidth) * 2 - 1; state.my = (e.clientY / innerHeight) * 2 - 1; });

/* ------------------------------------------------------------------ *
 *  Render loop
 * ------------------------------------------------------------------ */
let cur = null, lastT = performance.now(), clock = 0;
let ready = false, resizePending = true, navScrolled = null;
const GOLD = new THREE.Color(0xc9a24b), WHITE = new THREE.Color(0xffffff);

/* Resolution. The canvas is sized from its CSS box (100lvh = the largest viewport), so mobile
 * URL-bar movement never reallocates the WebGL buffer. The pixel ratio is chosen by timing real
 * frames on this GPU at load, and only ever steps down afterwards if frames get slow. */
const DPR_MAX = renderer ? Math.min(devicePixelRatio || 1, 2) : 1;
let dpr = DPR_MAX, sizedW = 0, sizedH = 0;
function applyResolution() {
  if (!renderer) return;
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  L.cw = w; L.ch = h;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sizedW = w; sizedH = h;
  invalidate();
}
addEventListener('resize', () => { resizePending = true; });
function checkResize() {
  resizePending = false;
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  if (w !== sizedW || h !== sizedH) applyResolution();
}

/** time a few real frames at each candidate pixel ratio (gl.finish forces the GPU to complete) */
function calibrate() {
  const gl = renderer.getContext();
  const candidates = [DPR_MAX, 1.5, 1.25, 1].filter((v, i, arr) => v <= DPR_MAX && arr.indexOf(v) === i);
  for (const cand of candidates) {
    dpr = cand; applyResolution();
    let total = 0, n = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      renderer.render(scene, camera); gl.finish();
      if (i > 0) { total += performance.now() - t0; n++; }
      if (i === 1 && total / n > 60) return (dpr = 1, applyResolution()); // clearly slow (software GL): don't waste time
    }
    if (total / n < 9) return; // leaves headroom for compositing + page work
  }
  dpr = 1; applyResolution();
}

/** after load: if real frames are slow, drop resolution one step (never raises again: no oscillation) */
const frameTimes = []; let lastDprChange = 0;
function watchFrameRate(dtMs) {
  if (!ready || dtMs > 250) return; // ignore tab switches / hitches
  frameTimes.push(dtMs);
  if (frameTimes.length < 45) return;
  frameTimes.sort((x, y) => x - y);
  const median = frameTimes[22];
  frameTimes.length = 0;
  const now = performance.now();
  if (median > 24 && dpr > 1 && now - lastDprChange > 2500) { dpr = Math.max(1, +(dpr - 0.25).toFixed(2)); lastDprChange = now; applyResolution(); }
}

/* ------------------------------------------------------------------ *
 *  Callout labels pinned to points on the 3D jacket (anatomy section)
 * ------------------------------------------------------------------ */
const NAMES = {
  biker: { zip: 'Asymmetric zip', collar: 'Snap-down lapel' },
  women: { zip: 'Centre-front zip', collar: 'Stand collar' },
};
const HOTSPOTS = [
  { step: 1, anchor: 'zip', key: 'zip' },
  { step: 2, anchor: 'collar', key: 'collar' },
  { step: 3, anchor: 'sleeveL', label: 'Sleeve' },
  { step: 3, anchor: 'body', label: 'Body & lapels' },
  { step: 3, anchor: 'hardware', label: 'Zips & snaps' },
  { step: 3, anchor: 'sleeveR', label: 'Sleeve' },
];
const hsLayer = $('#hotspots');
HOTSPOTS.forEach((h) => {
  h.el = document.createElement('div');
  h.el.className = 'hotspot';
  h.el.innerHTML = '<i></i><span></span>';
  hsLayer.appendChild(h.el);
});
const hsV = new THREE.Vector3();
function updateHotspots() {
  const inAnatomy = state.section === 'anatomy';
  const model = jacket.active.name;
  HOTSPOTS.forEach((h) => {
    const o = inAnatomy ? 1 - clamp(Math.abs(state.stepF - h.step) * 2.4) : 0;
    if (o < 0.02) { if (h.on) { h.el.style.opacity = 0; h.on = false; } return; }
    h.on = true;
    if (h.model !== model) { h.model = model; h.el.lastChild.textContent = h.label || NAMES[model][h.key]; }
    hsV.copy(jacket.anchor(h.anchor)).project(camera);
    const x = (hsV.x * 0.5 + 0.5) * L.cw, y = (-hsV.y * 0.5 + 0.5) * L.ch;
    h.el.style.transform = `translate(${x - 7}px, ${y - 7}px)`;
    h.el.style.opacity = o.toFixed(3);
  });
}

function tick(now) {
  requestAnimationFrame(tick);
  const dtMs = now - lastT;
  const dt = Math.min(0.05, dtMs / 1000);
  lastT = now; clock += dt;
  if (resizePending && renderer) checkResize();
  watchFrameRate(dtMs);

  const maxScroll = Math.max(1, L.docH - innerHeight);
  progressEl.style.transform = `scaleX(${clamp(scrollY / maxScroll).toFixed(4)})`;
  if (scrollY < innerHeight * 1.2) wordmark.style.transform = `translate3d(0, ${(scrollY * 0.18).toFixed(1)}px, 0)`;
  const scrolled = scrollY > 40;
  if (scrolled !== navScrolled) { navScrolled = scrolled; nav.classList.toggle('is-scrolled', scrolled); }
  const theme = currentTheme();
  if (document.body.dataset.theme !== theme) document.body.dataset.theme = theme;
  if (!renderer) { targetPose(); return; }

  const tgt = targetPose();
  if (!cur) cur = { ...tgt };
  const k = 1 - Math.exp(-dt * (reduceMotion ? 20 : 8.5)); // quick enough to feel attached to the scroll, smooth enough to hide wheel steps
  for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k;
  // a jacket pinned to a page element (configurator stage) must track the page itself, not trail behind a fast flick
  if (tgt.lk > 0.01) {
    const kf = k + ((1 - Math.exp(-dt * 38)) - k) * tgt.lk;
    cur.x += (tgt.x - cur.x) * kf; cur.y += (tgt.y - cur.y) * kf; cur.s += (tgt.s - cur.s) * kf;
  }

  // responsive layout: on portrait screens the jacket moves above the text
  const aspect = L.cw / L.ch;
  const portrait = aspect < 0.95;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const halfW = halfH * aspect;
  const abs = cur.abs > 0.5;
  const fit = abs ? 1 : clamp((aspect + 0.1) / 1.1, 0.5, 1);
  const px = cur.x * halfW;
  const py = cur.y;
  const sc = Math.max(0.0001, cur.s * fit);

  // yaw: drag (springs home outside the configurator) + idle sway + pointer parallax
  if (!state.dragging) {
    state.yaw += state.vel; state.vel *= 0.93;
    if (state.section === 'colours') { if (!reduceMotion) state.yaw += dt * 0.28; }
    else { const home = Math.round(state.yaw / (Math.PI * 2)) * Math.PI * 2; state.yaw += (home - state.yaw) * (1 - Math.exp(-dt * 1.6)); }
  }
  state.sx += (state.mx - state.sx) * (1 - Math.exp(-dt * 3));
  state.sy += (state.my - state.sy) * (1 - Math.exp(-dt * 3));
  const sway = reduceMotion ? 0 : Math.sin(clock * 0.5) * 0.07;

  rig.position.set(px, py + (reduceMotion ? 0 : Math.sin(clock * 0.9) * 0.012), 0);
  rig.scale.setScalar(sc);
  rig.rotation.set(cur.rx - state.sy * 0.06, cur.ry + state.yaw + sway + state.sx * 0.2, cur.rz);
  jacket.root.position.set(-cur.fx, -cur.fy, -cur.fz);
  rig.visible = sc > 0.01;
  jacket.explode(cur.ex);
  jacket.update(dt);

  // particles (only while they are on screen)
  dust.visible = state.section !== 'collection' && state.section !== 'categories';
  if (dust.visible) {
    const arr = dust.geometry.attributes.position.array, seed = dust.userData.seed;
    const fall = 0.04 + cur.snow * 0.32, sway2 = dt * 0.05;
    for (let i = 0; i < seed.length; i++) {
      arr[i * 3 + 1] -= dt * fall * (0.5 + seed[i]);
      arr[i * 3] += Math.sin(clock * 0.6 + seed[i] * 12) * sway2;
      if (arr[i * 3 + 1] < -2.2) arr[i * 3 + 1] = 2.2;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    dust.material.color.copy(GOLD).lerp(WHITE, cur.snow);
    dust.material.opacity = (portrait ? 0.25 : 0.4) + cur.snow * 0.4;
    dust.material.size = 0.04 + cur.snow * 0.03;
  }

  // slowly drifting studio reflections: highlights slide across the leather as the pointer moves / time passes
  scene.environmentRotation.y = state.sx * 0.45 + (reduceMotion ? 0 : Math.sin(clock * 0.18) * 0.25);
  rig.updateMatrixWorld(true);
  updateHotspots();

  // nothing 3D on screen (collection / categories): skip the draw and leave the canvas clear
  if (rig.visible || dust.visible) { renderer.render(scene, camera); state.cleared = false; }
  else if (!state.cleared) { renderer.clear(); state.cleared = true; }
  if (!ready) { ready = true; finishLoading(); }
}

function finishLoading() {
  setProgress(1);
  // build the 3D product ring while the browser is idle, not while the visitor is scrolling toward it
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(() => startRing(), { timeout: 2500 });
  const done = () => setTimeout(() => $('#loader')?.classList.add('is-done'), 250);
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]).then(done); else done();
}
if (renderer) {
  applyResolution();
  rig.scale.setScalar(1.8); // representative load while timing frames
  jacket.warmUp(renderer, scene, camera);
  calibrate();
}
requestAnimationFrame(tick);
if (!renderer) finishLoading();

/* ------------------------------------------------------------------ *
 *  Colour configurator
 * ------------------------------------------------------------------ */
const swatchWrap = $('#swatches');
let colourIdx = 0;
function renderPrice(p, el) {
  el.innerHTML = p.price
    ? `${formatINR(p.price)}${p.was ? ` <s>${formatINR(p.was)}</s>` : ''}`
    : '<small>Enquire for price &amp; sizes on cityroyalty.in</small>';
}
function selectColour(i, focus) {
  colourIdx = i;
  const p = products[i];
  $$('.swatch', swatchWrap).forEach((b, n) => { b.setAttribute('aria-checked', n === i); b.tabIndex = n === i ? 0 : -1; });
  if (jacket) { jacket.setModel(p.category === "Men's Jacket" ? 'biker' : 'women'); jacket.setColor(p.color); jacket.setRough(p.rough); }
  $('#colourWord').textContent = p.short.toLowerCase() + '.';
  $('#pCat').textContent = p.category;
  $('#pName').textContent = p.name;
  renderPrice(p, $('#pPrice'));
  $('#pBuy').href = p.url;
  const img = $('#pPhoto'); img.src = p.image; img.alt = p.name;
  if (focus) swatchWrap.children[i].focus();
}
products.forEach((p, i) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', p.name);
  b.style.setProperty('--c', p.color);
  b.innerHTML = `<i></i><span>${p.short}</span>`;
  b.addEventListener('click', () => selectColour(i));
  b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); selectColour((i + 1) % products.length, true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); selectColour((i - 1 + products.length) % products.length, true); }
  });
  swatchWrap.appendChild(b);
});
selectColour(0);

/* ------------------------------------------------------------------ *
 *  Collection ring (lazy: created when the section nears the viewport)
 * ------------------------------------------------------------------ */
const ringItems = [...products, { ...belt, short: 'Tan Belt' }];
belt.gallery = ['assets/img/IMG_6061.jpg', 'assets/img/IMG_6026.jpg'];
const D = { cat: $('#dCat'), name: $('#dName'), price: $('#dPrice'), desc: $('#dDesc'), sku: $('#dSku'), buy: $('#dBuy'), count: $('#dCount'), thumbs: $('#dThumbs') };
function showDetail(i) {
  const p = ringItems[i];
  D.cat.textContent = p.category;
  D.name.textContent = p.name;
  renderPrice(p, D.price);
  D.desc.textContent = p.desc || 'See full details, options and sizes on cityroyalty.in.';
  D.sku.textContent = p.sku || '—';
  D.sku.parentElement.style.display = p.sku ? '' : 'none';
  D.buy.href = p.url;
  const sizeWrap = $('#dSizes');
  sizeWrap.hidden = !p.sizes;
  $('#dSizeList').innerHTML = (p.sizes || []).map((z) => `<i>${z}</i>`).join('');
  D.count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(ringItems.length).padStart(2, '0');
  D.thumbs.innerHTML = '';
  const photos = [p.image, ...(p.gallery || [])].slice(0, 3);
  photos.forEach((src, n) => {
    const im = new Image(); im.src = src; im.alt = p.name + ' — photo ' + (n + 1); im.loading = 'lazy';
    im.addEventListener('click', () => openLightbox(photos, n, p.name));
    D.thumbs.appendChild(im);
  });
}
showDetail(0);
let ringStarted = false;
function startRing() {
  if (ringStarted) return; ringStarted = true;
  try {
    initRing({ canvas: $('#ringCanvas'), items: ringItems, onSelect: showDetail, onOpen: (i) => openUrl(ringItems[i].url) });
  } catch (e) { console.warn('Ring unavailable', e); $('#ring').innerHTML = '<p style="padding:2rem;text-align:center">3D view unavailable — see the product details below.</p>'; }
}
new IntersectionObserver((en) => { if (en[0].isIntersecting) startRing(); }, { rootMargin: '900px' }).observe($('#collection'));

/* ------------------------------------------------------------------ *
 *  Categories (3D tilt tiles)
 * ------------------------------------------------------------------ */
const grid = $('#catGrid');
categories.forEach((c) => {
  const li = document.createElement('li');
  li.className = 'cat' + (c.img ? '' : ' cat--plain');
  const contain = c.img && /\.png$/.test(c.img);
  li.innerHTML = `${c.img ? `<img src="${c.img}" alt="${c.name}" loading="lazy" class="${contain ? 'contain' : ''}" style="${c.pos ? `object-position:${c.pos}` : ''}">` : '<img src="assets/img/logo.png" alt="" class="crest" aria-hidden="true">'}
    <a href="${c.url}" target="_blank" rel="noopener" aria-label="Shop ${c.name} on cityroyalty.in"><h3>${c.name}</h3><p>${c.blurb}</p></a><span class="go" aria-hidden="true">↗</span>`;
  grid.appendChild(li);
  if (!reduceMotion && matchMedia('(hover: hover)').matches) {
    li.addEventListener('pointermove', (e) => {
      const r = li.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      li.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(14px)`;
    });
    li.addEventListener('pointerleave', () => { li.style.transform = ''; });
  }
});

/* ------------------------------------------------------------------ *
 *  Countdown + reveal-on-scroll
 * ------------------------------------------------------------------ */
const end = new Date(SALE_ENDS).getTime();
const pad = (n) => String(n).padStart(2, '0');
function countdown() {
  const d = Math.max(0, end - Date.now());
  $('#cdD').textContent = pad(Math.floor(d / 864e5));
  $('#cdH').textContent = pad(Math.floor(d / 36e5) % 24);
  $('#cdM').textContent = pad(Math.floor(d / 6e4) % 60);
  $('#cdS').textContent = pad(Math.floor(d / 1e3) % 60);
}
countdown(); setInterval(countdown, 1000);

/* ------------------------------------------------------------------ *
 *  Lightbox
 * ------------------------------------------------------------------ */
const lb = { el: $('#lightbox'), img: $('#lbImg'), cap: $('#lbCap'), list: [], i: 0, name: '' };
function lbShow() {
  lb.img.src = lb.list[lb.i]; lb.img.alt = lb.name;
  lb.cap.textContent = `${lb.name}  ·  ${lb.i + 1} / ${lb.list.length}`;
}
function openLightbox(list, i, name) { lb.list = list; lb.i = i; lb.name = name; lbShow(); lb.el.hidden = false; $('#lbClose').focus(); }
const closeLightbox = () => { lb.el.hidden = true; };
$('#lbClose').addEventListener('click', closeLightbox);
$('#lbPrev').addEventListener('click', () => { lb.i = (lb.i - 1 + lb.list.length) % lb.list.length; lbShow(); });
$('#lbNext').addEventListener('click', () => { lb.i = (lb.i + 1) % lb.list.length; lbShow(); });
lb.el.addEventListener('click', (e) => { if (e.target === lb.el) closeLightbox(); });

/* ------------------------------------------------------------------ *
 *  Search (products + categories; opens the real product page)
 * ------------------------------------------------------------------ */
const searchItems = [
  ...products.map((p) => ({ title: p.name, sub: `${p.category} · ${p.price ? formatINR(p.price) : 'Enquire for price'}`, img: p.image, url: p.url, text: `${p.name} ${p.sku} ${p.category} ${p.short} jacket leather` })),
  { title: belt.name, sub: 'Belts', img: belt.image, url: belt.url, text: `${belt.name} belt belts leather` },
  ...categories.map((c) => ({ title: c.name, sub: 'Category', img: c.img, url: c.url, text: `${c.name} ${c.blurb} category shop` })),
];
const sBox = $('#search'), sInput = $('#searchInput'), sList = $('#searchResults');
let sSel = 0, sShown = [];
function renderSearch() {
  const q = sInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  sShown = (q.length ? searchItems.filter((it) => q.every((w) => it.text.toLowerCase().includes(w))) : searchItems.slice(0, 8)).slice(0, 12);
  sSel = Math.min(sSel, Math.max(0, sShown.length - 1));
  sList.innerHTML = sShown.length
    ? sShown.map((it, n) => `<li role="option" aria-selected="${n === sSel}"><a href="${it.url}" target="_blank" rel="noopener">${it.img ? `<img src="${it.img}" alt="" loading="lazy">` : '<img alt="" src="assets/img/logo.png" style="object-fit:contain;padding:6px">'}<span><b>${it.title}</b><small>${it.sub}</small></span></a></li>`).join('')
    : '<li class="search__empty">No products match that. Try “biker”, “maroon” or “belt”.</li>';
}
function openSearch() { sBox.hidden = false; sInput.value = ''; sSel = 0; renderSearch(); sInput.focus(); }
function closeSearch() { sBox.hidden = true; $('#searchBtn').focus(); }
$('#searchBtn').addEventListener('click', openSearch);
$('#searchClose').addEventListener('click', closeSearch);
sBox.addEventListener('click', (e) => { if (e.target === sBox) closeSearch(); });
sInput.addEventListener('input', () => { sSel = 0; renderSearch(); });
addEventListener('keydown', (e) => {
  if (!lb.el.hidden) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') $('#lbPrev').click();
    if (e.key === 'ArrowRight') $('#lbNext').click();
    return;
  }
  if (!sBox.hidden) {
    if (e.key === 'Escape') closeSearch();
    if (e.key === 'ArrowDown') { e.preventDefault(); sSel = (sSel + 1) % Math.max(1, sShown.length); renderSearch(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sSel = (sSel - 1 + sShown.length) % Math.max(1, sShown.length); renderSearch(); }
    if (e.key === 'Enter' && sShown[sSel]) openUrl(sShown[sSel].url);
    return;
  }
  if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); openSearch(); }
});

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
$$('.display, .lead, .stats li, .cat, .promise__grid > div, .kicker, .sale__big, .countdown, .detail__main, .hero__title, .hero__lede, .hero__cta')
  .forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
