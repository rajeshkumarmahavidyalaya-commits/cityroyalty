import * as THREE from 'three';

/* 3D product ring: real City Royalty product photos on rounded cards arranged on a
 * cylinder. Drag / swipe / arrows to spin, click a card to bring it to the front. */

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}

function labelTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = '#f1e9d9';
  g.font = '600 38px Fraunces, Georgia, serif';
  g.fillText(title, 256, 46);
  g.fillStyle = '#c9a24b';
  g.font = '700 21px Manrope, Arial, sans-serif';
  g.fillText(sub.toUpperCase(), 256, 88);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function initRing({ canvas, items, onSelect, onOpen }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  const N = items.length;
  const STEP = TAU / N;
  const CARD_W = 1.3, CARD_H = 1.68;
  const R = Math.max(2.4, (N * (CARD_W + 0.42)) / TAU);

  const ring = new THREE.Group();
  scene.add(ring);
  const cards = [];
  const loader = new THREE.TextureLoader();
  const cardGeo = roundedRect(CARD_W, CARD_H, 0.1);
  const frameGeo = roundedRect(CARD_W + 0.05, CARD_H + 0.05, 0.12);
  const labelGeo = new THREE.PlaneGeometry(CARD_W * 1.15, CARD_W * 1.15 * (112 / 512));

  items.forEach((it, i) => {
    const g = new THREE.Group();
    const a = i * STEP;
    g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    g.rotation.y = a;

    const frameMat = new THREE.MeshBasicMaterial({ color: 0xc9a24b, transparent: true });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.004;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.FrontSide });
    const card = new THREE.Mesh(cardGeo, mat);
    card.userData.index = i;
    loader.load(it.image, (tex) => {
      // photos are up to 1600px but a card is ~400 CSS px: shrink once so the GPU upload (and memory) is small
      const src = tex.image, k = Math.min(1, 1024 / Math.max(src.width, src.height));
      if (k < 1) {
        const cv = document.createElement('canvas');
        cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
        cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
        tex.image = cv;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      const ia = tex.image.width / tex.image.height, ca = CARD_W / CARD_H;
      if (ia > ca) { tex.repeat.x = ca / ia; tex.offset.x = (1 - tex.repeat.x) / 2; }
      else { tex.repeat.y = ia / ca; tex.offset.y = (1 - tex.repeat.y) * 0.7; }
      mat.map = tex; mat.needsUpdate = true;
      renderer.initTexture(tex); // upload now, off the scroll path
    });
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture(it.short || it.name, it.price ? '₹' + it.price.toLocaleString('en-IN') : it.category), transparent: true });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, -CARD_H / 2 - 0.22, 0.01);
    g.add(frame, card, label);
    ring.add(g);
    cards.push({ g, mat, frameMat, labelMat, angle: a });
  });

  // brass floor ring + soft glow
  const floor = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.05, 0.008, 8, 160),
    new THREE.MeshBasicMaterial({ color: 0xc9a24b, transparent: true, opacity: 0.55 })
  );
  floor.rotation.x = Math.PI / 2;
  floor.position.y = -CARD_H / 2 - 0.5;
  ring.add(floor);

  let rot = 0, rotTarget = 0, vel = 0, dragging = false, lastX = 0, moved = 0, selected = -1;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover = -1;

  const frontIndex = () => ((Math.round(rotTarget / STEP) % N) + N) % N;
  const snap = () => { rotTarget = Math.round(rotTarget / STEP) * STEP; };
  const go = (i) => {
    // shortest way round to card i
    const cur = rotTarget / STEP;
    let d = ((i - cur) % N + N) % N;
    if (d > N / 2) d -= N;
    rotTarget = (Math.round(cur) + Math.round(d)) * STEP;
  };

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wide = w / h;
    camera.position.set(0, 0.55, R + (wide < 0.8 ? 7.6 : wide < 1.3 ? 6.2 : 5.1));
    camera.lookAt(0, -0.05, R * 0.6);
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  const holder = canvas.parentElement;
  const pos = (e) => e.clientX;
  holder.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true; moved = 0; lastX = pos(e); vel = 0;
    holder.setPointerCapture(e.pointerId);
    holder.classList.add('is-grabbing');
  });
  holder.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    if (dragging) {
      const dx = pos(e) - lastX;
      lastX = pos(e);
      moved += Math.abs(dx);
      const d = -dx * 0.0042;
      rotTarget += d; rot += d; vel = d;
    } else {
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(cards.map((c) => c.g.children[1]))[0];
      hover = hit ? hit.object.userData.index : -1;
      holder.style.cursor = hover >= 0 ? 'pointer' : 'grab';
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    holder.classList.remove('is-grabbing');
    if (moved < 6) {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(cards.map((c) => c.g.children[1]))[0];
      if (hit) {
        const i = hit.object.userData.index;
        if (i === frontIndex()) onOpen?.(i); else go(i);
        return;
      }
    }
    rotTarget += vel * 14;
    snap();
  };
  holder.addEventListener('pointerup', end);
  holder.addEventListener('pointercancel', end);
  document.getElementById('ringPrev')?.addEventListener('click', () => { rotTarget = Math.round(rotTarget / STEP) * STEP - STEP; });
  document.getElementById('ringNext')?.addEventListener('click', () => { rotTarget = Math.round(rotTarget / STEP) * STEP + STEP; });
  holder.setAttribute('tabindex', '0');
  holder.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') rotTarget = Math.round(rotTarget / STEP) * STEP - STEP;
    if (e.key === 'ArrowRight') rotTarget = Math.round(rotTarget / STEP) * STEP + STEP;
  });

  let visible = false, last = performance.now(), t = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) last = performance.now(); }, { rootMargin: '120px' }).observe(holder);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    if (!dragging) rot += (rotTarget - rot) * (1 - Math.exp(-dt * 7));
    ring.rotation.y = -rot;
    ring.rotation.x = 0.07;
    ring.position.y = Math.sin(t * 0.8) * 0.02;

    cards.forEach((c, i) => {
      let d = c.angle - rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const f = Math.cos(d);
      const o = 0.12 + 0.88 * smooth(-0.1, 0.8, f);
      const lit = 0.38 + 0.62 * smooth(0.1, 0.95, f);
      c.mat.opacity = o; c.frameMat.opacity = o * (0.35 + 0.65 * smooth(0.9, 1, f));
      c.labelMat.opacity = o * smooth(0.3, 0.95, f);
      c.mat.color.setScalar(lit);
      const pop = 1 + 0.14 * smooth(0.88, 1, f) + (hover === i ? 0.05 : 0);
      c.g.scale.setScalar(THREE.MathUtils.lerp(c.g.scale.x, pop, 1 - Math.exp(-dt * 10)));
      c.g.position.y = THREE.MathUtils.lerp(c.g.position.y, hover === i ? 0.06 : 0, 1 - Math.exp(-dt * 8));
    });

    const fi = frontIndex();
    if (fi !== selected) { selected = fi; onSelect?.(fi); }
    renderer.render(scene, camera);
  }
  renderer.compile(scene, camera); // shaders ready before the section scrolls in
  requestAnimationFrame(frame);

  return { select: go, get index() { return selected; } };
}
