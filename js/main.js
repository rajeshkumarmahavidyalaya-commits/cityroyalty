import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildJacket } from './jacket.js';
import { initRing } from './carousel.js';
import { products, belt, categories, formatINR, SALE_ENDS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ *
 *  Poses: where the 3D jacket sits for each scroll section.
 *  x is a fraction of the visible half-width, y/fx/fy/fz in world/model units,
 *  s scale, ry/rx/rz rotation, ex = exploded amount, snow = particle mode.
 * ------------------------------------------------------------------ */
const P = (o) => ({ x: 0, y: 0, s: 1, ry: 0, rx: 0, rz: 0, ex: 0, fx: 0, fy: 0, fz: 0, snow: 0, abs: 0, ...o });
const POSES = {
  hero:  P({ x: 0.3, y: 0.05, s: 1.45, ry: -0.32, rx: 0.03 }),
  story: P({ x: 0.44, y: 0.0, s: 1.4, ry: -0.8, rz: 0.07 }),
  a0:    P({ x: 0.42, y: 0.0, s: 1.45, ry: -0.5, ex: 0.0 }),
  a1:    P({ x: 0.42, y: 0.02, s: 2.3, ry: -0.18, fx: 0.06, fy: 0.12, fz: 0.17 }),
  a2:    P({ x: 0.42, y: 0.0, s: 2.5, ry: 0.28, fx: 0.07, fy: 0.3, fz: 0.15 }),
  a3:    P({ x: 0.38, y: 0.0, s: 1.15, ry: 0.35, rx: 0.06, ex: 1.0 }),
  colours: P({ x: 0.0, y: 0.04, s: 1.55, ry: 0.0 }),
  sale:  P({ x: -0.5, y: 0.0, s: 1.35, ry: 0.85, rz: -0.08, snow: 1 }),
  away:  P({ x: 0.0, y: -0.2, s: 0.0001, ry: 1.2 }),
};
const TRACKS = { anatomy: ['a0', 'a1', 'a2', 'a3'] };
const KEYS = Object.keys(POSES.hero);
const mixPose = (a, b, t) => { const o = {}; for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; };

/* ------------------------------------------------------------------ *
 *  Boot the main scene
 * ------------------------------------------------------------------ */
const canvas = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL unavailable, using static fallback', e);
  document.documentElement.classList.add('no-webgl');
}

const loaderBar = $('#loaderBar');
const setProgress = (v) => { if (loaderBar) loaderBar.style.width = Math.round(v * 100) + '%'; };
setProgress(0.15);

let jacket, rig, scene, camera, dust;
const state = { yaw: 0, vel: 0, dragging: false, mx: 0, my: 0, sx: 0, sy: 0, section: 'hero' };

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.02, 3.6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  const key = new THREE.DirectionalLight(0xfff1de, 1.5);
  key.position.set(-2.5, 3, 3.5);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 1.1);
  rim.position.set(3, 1.5, -3);
  const warm = new THREE.PointLight(0xc9a24b, 6, 8);
  warm.position.set(1.5, -0.4, 2.2);
  scene.add(key, rim, warm);
  setProgress(0.4);

  jacket = buildJacket({ maxAniso: renderer.capabilities.getMaxAnisotropy() });
  rig = new THREE.Group();
  rig.add(jacket.root);
  scene.add(rig);
  jacket.setColor(products[0].color);
  jacket.update(10);
  setProgress(0.75);

  // dust motes (gold) that turn into snow in the winter section
  const COUNT = 650;
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

// Sections can pin the jacket to an element (data-anchor): it is centred on that element and
// scaled to fit it, so the HTML layout and the 3D pose can never drift apart.
const JACKET_H = 0.8, JACKET_W = 0.88;
function anchored(el, pose) {
  const a = el.dataset.anchor && $(el.dataset.anchor, el);
  if (!a || !camera) return pose;
  const r = a.getBoundingClientRect();
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const halfW = halfH * (innerWidth / innerHeight);
  const y = clamp(((innerHeight / 2 - (r.top + r.height / 2)) / (innerHeight / 2)) * halfH, -halfH * 1.7, halfH * 1.7);
  const x = ((r.left + r.width / 2 - innerWidth / 2) / (innerWidth / 2));
  const s = Math.min(((r.height / innerHeight) * 2 * halfH) / JACKET_H, ((r.width / innerWidth) * 2 * halfW) / JACKET_W);
  return { ...pose, y, x, s, abs: 1 };
}
// On portrait screens the text needs the whole width, so the jacket sits out these sections.
const PORTRAIT_SWAP = { story: 'away', sale: 'away' };
function sectionKeys(el) {
  if (el.dataset.track) return TRACKS[el.dataset.track].map((k) => POSES[k]);
  const portrait = innerWidth / innerHeight < 0.95;
  const name = (portrait && PORTRAIT_SWAP[el.dataset.pose]) || el.dataset.pose;
  return [anchored(el, POSES[name])];
}

function targetPose() {
  const vh = innerHeight, vc = vh * 0.5;
  const rects = poseSections.map((el) => el.getBoundingClientRect());
  let idx = rects.findIndex((r) => r.top <= vc && r.bottom > vc);
  if (idx < 0) idx = vc < rects[0].top ? 0 : poseSections.length - 1;
  const el = poseSections[idx], keys = sectionKeys(el);
  state.section = el.id || 'hero';

  // pose inside the section (anatomy interpolates per step)
  let pose = keys[0];
  if (keys.length > 1) {
    const cs = steps.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
    let f = 0;
    if (vc >= cs[cs.length - 1]) f = cs.length - 1;
    else if (vc > cs[0]) {
      const k = cs.findIndex((c, i) => vc >= c && vc < cs[i + 1]);
      f = k + (vc - cs[k]) / (cs[k + 1] - cs[k]);
    }
    const i = Math.min(keys.length - 2, Math.floor(f));
    pose = mixPose(keys[i], keys[i + 1], smooth(0.2, 0.8, f - i));
    steps.forEach((s, n) => s.classList.toggle('is-active', Math.abs(f - n) < 0.55));
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
  const vc = innerHeight * 0.5;
  for (const el of themed) {
    const r = el.getBoundingClientRect();
    if (r.top <= vc && r.bottom > vc) return el.dataset.theme || 'light';
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
let ready = false;

function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now; clock += dt;

  nav.classList.toggle('is-scrolled', scrollY > 40);
  const theme = currentTheme();
  if (document.body.dataset.theme !== theme) document.body.dataset.theme = theme;
  if (!renderer) { targetPose(); return; }

  const tgt = targetPose();
  if (!cur) cur = { ...tgt };
  const k = 1 - Math.exp(-dt * (reduceMotion ? 20 : 5.5));
  for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k;

  // responsive layout: on portrait screens the jacket moves above the text
  const aspect = innerWidth / innerHeight;
  const portrait = aspect < 0.95;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const halfW = halfH * aspect;
  const abs = cur.abs > 0.5;
  const fit = abs ? 1 : clamp((aspect + 0.1) / 1.1, 0.5, 1);
  const px = portrait && !abs ? 0 : cur.x * halfW;
  let py = cur.y + (portrait && !abs ? 0.34 * Math.min(1, cur.s) : 0);
  if (portrait && state.section === 'anatomy') py = 0.38;
  const sc = Math.max(0.0001, cur.s * fit * (portrait && cur.fx ? 0.62 : 1));

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

  // particles
  const arr = dust.geometry.attributes.position.array, seed = dust.userData.seed;
  const fall = 0.04 + cur.snow * 0.32;
  for (let i = 0; i < seed.length; i++) {
    arr[i * 3 + 1] -= dt * fall * (0.5 + seed[i]);
    arr[i * 3] += Math.sin(clock * 0.6 + seed[i] * 12) * dt * 0.05;
    if (arr[i * 3 + 1] < -2.2) arr[i * 3 + 1] = 2.2;
  }
  dust.geometry.attributes.position.needsUpdate = true;
  dust.material.color.set(0xc9a24b).lerp(new THREE.Color(0xffffff), cur.snow);
  dust.material.opacity = (portrait ? 0.25 : 0.4) + cur.snow * 0.4;
  dust.material.size = 0.04 + cur.snow * 0.03;
  dust.visible = state.section !== 'collection' && state.section !== 'categories';

  renderer.render(scene, camera);
  if (!ready) { ready = true; finishLoading(); }
}

function finishLoading() {
  setProgress(1);
  const done = () => setTimeout(() => $('#loader')?.classList.add('is-done'), 250);
  if (document.fonts?.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]).then(done); else done();
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
  if (jacket) { jacket.setColor(p.color); jacket.setRough(p.rough); }
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
  D.count.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(ringItems.length).padStart(2, '0');
  D.thumbs.innerHTML = '';
  [p.image, ...(p.gallery || [])].slice(0, 3).forEach((src) => {
    const im = new Image(); im.src = src; im.alt = p.name; im.loading = 'lazy'; D.thumbs.appendChild(im);
  });
}
showDetail(0);
let ringStarted = false;
function startRing() {
  if (ringStarted) return; ringStarted = true;
  try {
    initRing({ canvas: $('#ringCanvas'), items: ringItems, onSelect: showDetail, onOpen: (i) => window.open(ringItems[i].url, '_blank', 'noopener') });
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

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
$$('.display, .lead, .stats li, .cat, .promise__grid > div, .kicker, .sale__big, .countdown, .detail__main, .hero__title, .hero__lede, .hero__cta')
  .forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
