import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Procedural leather biker jacket.
 *  No external model: torso, sleeves, lapels, hardware are generated
 *  from curves so every part can fly apart for the "anatomy" view and
 *  the leather colour can be changed live.
 * ------------------------------------------------------------------ */

// ---------- tiny periodic value noise (for grain + wrinkles) ----------
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}
function fbm(x, y, z) {
  return vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

// ---------- leather grain normal map (periodic Voronoi pebbles) ----------
function makeGrainNormalMap(size = 512, cells = 36) {
  const pts = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      pts.push([i + 0.15 + Math.random() * 0.7, j + 0.15 + Math.random() * 0.7]);
    }
  }
  const h = new Float32Array(size * size);
  const cs = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cs, gy = y / cs;
      const cx = Math.floor(gx), cy = Math.floor(gy);
      let d1 = 9, d2 = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (((cx + ox) % cells) + cells) % cells;
          const iy = (((cy + oy) % cells) + cells) % cells;
          const p = pts[iy * cells + ix];
          const px = p[0] + (cx + ox - ix), py = p[1] + (cy + oy - iy);
          const d = Math.hypot(gx - px, gy - py);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      const pebble = Math.max(0, 1 - Math.pow(d1 * 1.25, 2));
      const groove = Math.min(1, (d2 - d1) * 3.2);
      h[y * size + x] = pebble * (0.45 + 0.55 * groove) * 0.9 + (Math.random() - 0.5) * 0.06;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const s = 2.6;
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * s;
      const dy = (at(x, y + 1) - at(x, y - 1)) * s;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (inv * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function whiten(geo, v = 0.96) {
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(v), 3));
  return geo;
}
function medalFace() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(54, 48, 6, 64, 64, 64);
  grad.addColorStop(0, '#e8c76a'); grad.addColorStop(1, '#9c7a2a');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#4a3510'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke();
  g.fillStyle = '#3a2808'; g.font = 'bold 66px "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('R', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.35 });
}
const sgnpow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- main builder ----------
export function buildJacket({ maxAniso = 8 } = {}) {
  const root = new THREE.Group();
  const parts = {};
  const N_EXP = 2.7; // superellipse exponent of the torso cross-section

  const grain = makeGrainNormalMap();
  grain.anisotropy = maxAniso;

  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x4a2716,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    sheen: 0.0,
    envMapIntensity: 0.75,
    normalMap: grain,
    normalScale: new THREE.Vector2(0.55, 0.55),
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const lining = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.9, side: THREE.DoubleSide });
  const brass = new THREE.MeshStandardMaterial({ color: 0xcaa24c, metalness: 1, roughness: 0.28 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.8 });

  // ---------------- torso ----------------
  const profile = new THREE.CatmullRomCurve3(
    [
      [0.246, 0.0, 0.148],
      [0.254, 0.05, 0.153],
      [0.262, 0.2, 0.158],
      [0.262, 0.34, 0.16],
      [0.285, 0.46, 0.168],
      [0.292, 0.56, 0.163],
      [0.276, 0.62, 0.15],
      [0.205, 0.665, 0.125],
      [0.138, 0.69, 0.105],
      [0.112, 0.706, 0.094],
    ].map((p) => new THREE.Vector3(...p)),
    false,
    'centripetal'
  );
  const R = 110, C = 120;
  const rowsP = profile.getSpacedPoints(R); // x=a, y=height, z=b
  const profileAt = (y) => {
    for (let i = 0; i < rowsP.length - 1; i++) {
      if (y <= rowsP[i + 1].y) {
        const t = (y - rowsP[i].y) / Math.max(1e-6, rowsP[i + 1].y - rowsP[i].y);
        return { a: rowsP[i].x + (rowsP[i + 1].x - rowsP[i].x) * t, b: rowsP[i].z + (rowsP[i + 1].z - rowsP[i].z) * t };
      }
    }
    return { a: rowsP[R].x, b: rowsP[R].z };
  };
  // asymmetric biker zip: seam runs diagonally from the hem centre to the neck
  const seamX = (y) => 0.01 + 0.085 * smooth(0.04, 0.67, y);

  const pos = new Float32Array((R + 1) * (C + 1) * 3);
  const uv = new Float32Array((R + 1) * (C + 1) * 2);
  const idx = [];
  const tmp = new THREE.Vector3();
  for (let r = 0; r <= R; r++) {
    const { x: a, y, z: b } = rowsP[r];
    const sx = Math.max(-0.99, Math.min(0.99, seamX(y) / a));
    const phi0 = Math.asin(sgnpow(sx, N_EXP / 2));
    for (let c = 0; c <= C; c++) {
      const phi = phi0 + (c / C) * Math.PI * 2;
      const i = r * (C + 1) + c;
      pos[i * 3] = a * sgnpow(Math.sin(phi), 2 / N_EXP);
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = b * sgnpow(Math.cos(phi), 2 / N_EXP);
      uv[i * 2] = (c / C) * 16;
      uv[i * 2 + 1] = (r / R) * 7;
      if (r < R && c < C) {
        const i2 = i + C + 1;
        idx.push(i, i2, i + 1, i + 1, i2, i2 + 1);
      }
    }
  }
  const torsoGeo = new THREE.BufferGeometry();
  torsoGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  torsoGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  torsoGeo.setIndex(idx);
  wrinkleAndShade(torsoGeo, { seamC: C + 1, seamRows: R + 1, amp: 0.0042, freq: 9, seed: 0 });

  const torso = new THREE.Mesh(torsoGeo, leather);
  const body = new THREE.Group();
  body.add(torso);
  parts.body = body;

  // ---------------- sleeves ----------------
  function makeSleeve(sign) {
    const path = new THREE.CatmullRomCurve3(
      [
        [0.2, 0.578, 0.0],
        [0.282, 0.556, 0.004],
        [0.342, 0.45, 0.022],
        [0.374, 0.31, 0.058],
        [0.392, 0.16, 0.098],
      ].map(([x, y, z]) => new THREE.Vector3(x * sign, y, z))
    );
    const seg = 56, rad = 32;
    const frames = path.computeFrenetFrames(seg, false);
    const sp = new Float32Array((seg + 1) * (rad + 1) * 3);
    const su = new Float32Array((seg + 1) * (rad + 1) * 2);
    const si = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const P = path.getPointAt(t);
      const N = frames.normals[i], B = frames.binormals[i];
      let r = THREE.MathUtils.lerp(0.075, 0.046, smooth(0.0, 1.0, t) * 0.85 + t * 0.15);
      if (t > 0.9) r += 0.0035 * smooth(0.9, 0.915, t); // cuff band
      for (let j = 0; j <= rad; j++) {
        const ang = (j / rad) * Math.PI * 2;
        const k = i * (rad + 1) + j;
        sp[k * 3] = P.x + (N.x * Math.cos(ang) + B.x * Math.sin(ang) * 0.93) * r;
        sp[k * 3 + 1] = P.y + (N.y * Math.cos(ang) + B.y * Math.sin(ang) * 0.93) * r;
        sp[k * 3 + 2] = P.z + (N.z * Math.cos(ang) + B.z * Math.sin(ang) * 0.93) * r;
        su[k * 2] = (j / rad) * 4.2;
        su[k * 2 + 1] = t * 6;
        if (i < seg && j < rad) {
          const k2 = k + rad + 1;
          si.push(k, k2, k + 1, k + 1, k2, k2 + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(su, 2));
    g.setIndex(si);
    wrinkleAndShade(g, { seamC: rad + 1, seamRows: seg + 1, amp: 0.0034, freq: 12, seed: sign > 0 ? 3 : 7, sleeve: true });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, leather));
    // cuff opening (dark lining)
    const end = path.getPointAt(1);
    const tan = path.getTangentAt(1);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), lining);
    disc.position.copy(end).addScaledVector(tan, -0.012);
    disc.lookAt(end.clone().add(tan));
    grp.add(disc);
    // cuff snap
    const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 20), brass);
    const sn = new THREE.Vector3(sign, 0.1, 0.3).normalize();
    snap.position.copy(path.getPointAt(0.945)).addScaledVector(sn, 0.058);
    snap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sn);
    grp.add(snap);
    return grp;
  }
  parts.sleeveR = makeSleeve(1);
  parts.sleeveL = makeSleeve(-1);

  // ---------------- collar + lapels ----------------
  const collar = new THREE.Group();
  const band = new THREE.Mesh(whiten(new THREE.CylinderGeometry(0.118, 0.112, 0.046, 48, 1, true)), leather);
  band.scale.z = 0.86;
  band.position.set(0, 0.722, -0.004);
  collar.add(band);
  parts.collar = collar;

  // ---------------- hardware (zips, pockets, epaulettes) ----------------
  const hardware = new THREE.Group();
  const toothGeo = new THREE.BoxGeometry(0.0072, 0.0042, 0.0034);
  const basis = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
  const px = new THREE.Vector3(), tX = new THREE.Vector3(), tY = new THREE.Vector3(), tZ = new THREE.Vector3();

  // main zip: sample the seam (col 0) of the displaced torso
  const posA = torsoGeo.attributes.position, norA = torsoGeo.attributes.normal;
  const seamPts = [], seamNor = [];
  for (let r = 4; r <= R - 1; r++) {
    const i = r * (C + 1);
    seamPts.push(new THREE.Vector3().fromBufferAttribute(posA, i));
    seamNor.push(new THREE.Vector3().fromBufferAttribute(norA, i).negate()); // torso winding makes computed normals point inward
  }
  const teeth = new THREE.InstancedMesh(toothGeo, brass, seamPts.length * 2);
  let n = 0;
  for (let i = 0; i < seamPts.length; i++) {
    const p = seamPts[i], nor = seamNor[i];
    const nxt = seamPts[Math.min(seamPts.length - 1, i + 1)], prv = seamPts[Math.max(0, i - 1)];
    tY.copy(nxt).sub(prv).normalize();
    tZ.copy(nor).normalize();
    tX.crossVectors(tY, tZ).normalize();
    tY.crossVectors(tZ, tX).normalize();
    for (let k = 0; k < 2; k++) {
      const off = (k === 0 ? -1 : 1) * 0.0026;
      px.copy(p).addScaledVector(tX, off * (i % 2 ? 1 : 1)).addScaledVector(tY, k * 0.0036 * 0.5).addScaledVector(tZ, 0.0066);
      basis.makeBasis(tX, tY, tZ);
      q.setFromRotationMatrix(basis);
      teeth.setMatrixAt(n++, new THREE.Matrix4().compose(px, q, s1));
    }
  }
  hardware.add(teeth);
  const seamTape = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts.map((p, i) => p.clone().addScaledVector(seamNor[i], 0.0))), 200, 0.0042, 6, false),
    tape
  );
  hardware.add(seamTape);
  // zip pull at the neck end
  {
    const top = seamPts[seamPts.length - 2], tn = seamNor[seamNor.length - 2];
    const pull = new THREE.Group();
    const slider = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.022, 0.006), brass);
    const tab = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 8, 20), brass);
    tab.position.set(0, -0.022, 0.006);
    tab.scale.y = 1.5;
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.0032, 32), [brass, medalFace(), brass]);
    medal.rotation.x = Math.PI / 2;
    medal.position.set(0, -0.052, 0.008);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.02, 6), brass);
    chain.position.set(0, -0.0345, 0.0075);
    pull.add(slider, tab, medal, chain);
    pull.position.copy(top).addScaledVector(tn, 0.006);
    pull.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tn);
    pull.rotation.z += 0.14;
    hardware.add(pull);
  }

  // helper: place a zip pocket along a line on the front surface
  function surfaceAt(x, y) {
    const { a, b } = profileAt(y);
    const xr = Math.max(-0.98 * a, Math.min(0.98 * a, x));
    const z = b * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xr) / a, N_EXP)), 1 / N_EXP);
    const nx = Math.sign(xr) * Math.pow(Math.abs(xr), N_EXP - 1) / Math.pow(a, N_EXP);
    const nz = Math.pow(z, N_EXP - 1) / Math.pow(b, N_EXP);
    const nrm = new THREE.Vector3(nx, 0, nz).normalize();
    return { p: new THREE.Vector3(xr, y, z), n: nrm };
  }
  function zipLine(x1, y1, x2, y2, count) {
    const m = new THREE.InstancedMesh(toothGeo, brass, count);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const { p, n: nrm } = surfaceAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      p.addScaledVector(nrm, 0.0052);
      const a2 = surfaceAt(x1 + (x2 - x1) * Math.min(1, t + 0.02), y1 + (y2 - y1) * Math.min(1, t + 0.02)).p;
      const a1 = surfaceAt(x1 + (x2 - x1) * Math.max(0, t - 0.02), y1 + (y2 - y1) * Math.max(0, t - 0.02)).p;
      tY.copy(a2).sub(a1).normalize();
      tZ.copy(nrm);
      tX.crossVectors(tY, tZ).normalize();
      tY.crossVectors(tZ, tX).normalize();
      basis.makeBasis(tX, tY, tZ);
      q.setFromRotationMatrix(basis);
      m.setMatrixAt(i, new THREE.Matrix4().compose(p, q, s1));
      pts.push(p.clone().addScaledVector(nrm, -0.0045));
    }
    hardware.add(m);
    const welt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0045, 6, false), tape);
    hardware.add(welt);
    const last = pts[pts.length - 1];
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.005), brass);
    pull.position.copy(last).addScaledVector(surfaceAt(x2, y2).n, 0.006);
    pull.quaternion.copy(q);
    hardware.add(pull);
  }
  zipLine(-0.2, 0.455, -0.075, 0.535, 22); // chest pocket
  zipLine(-0.175, 0.1, -0.168, 0.265, 26); // hip pockets
  zipLine(0.175, 0.1, 0.168, 0.265, 26);

  // lapels: patches that hug the chest surface and lift slightly at the outer edge
  function makeLapel(sign) {
    const corners = [
      [0.012, 0.708], // inner top (neck)
      [0.175, 0.662], // outer top (shoulder)
      [0.225, 0.535], // tip
      [0.05, 0.575], // inner bottom
    ];
    const GU = 14, GV = 14;
    const lp = new Float32Array((GU + 1) * (GV + 1) * 3);
    const lu = new Float32Array((GU + 1) * (GV + 1) * 2);
    const li = [];
    const lerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    for (let v = 0; v <= GV; v++) {
      for (let u = 0; u <= GU; u++) {
        const s0 = u / GU, t0 = v / GV;
        const top = lerp2(corners[0], corners[1], s0);
        const bot = lerp2(corners[3], corners[2], s0);
        let [x, y] = lerp2(top, bot, t0);
        // soft rounded tip / curved lower edge
        y += -0.03 * Math.sin(Math.PI * s0) * t0 * t0;
        const { p, n } = surfaceAt(x * sign, y);
        const lift = 0.0105 + 0.028 * s0 * s0 + 0.004 * Math.sin(Math.PI * t0) * s0;
        p.addScaledVector(n, lift);
        const k = v * (GU + 1) + u;
        lp[k * 3] = p.x; lp[k * 3 + 1] = p.y; lp[k * 3 + 2] = p.z;
        lu[k * 2] = x * 10; lu[k * 2 + 1] = y * 10;
        if (u < GU && v < GV) {
          const k2 = k + GU + 1;
          li.push(k, k2, k + 1, k + 1, k2, k2 + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(lu, 2));
    g.setIndex(li);
    g.computeVertexNormals();
    whiten(g);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, leather));
    // rolled edge
    const edge = [];
    for (let u = 0; u <= GU; u++) edge.push(new THREE.Vector3().fromArray(lp, (0 * (GU + 1) + u) * 3));
    for (let v = 1; v <= GV; v++) edge.push(new THREE.Vector3().fromArray(lp, (v * (GU + 1) + GU) * 3));
    for (let u = GU - 1; u >= 0; u--) edge.push(new THREE.Vector3().fromArray(lp, (GV * (GU + 1) + u) * 3));
    const rim = new THREE.Mesh(whiten(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 140, 0.0034, 6, false)), leather);
    grp.add(rim);
    const tip = new THREE.Vector3().fromArray(lp, (GV * (GU + 1) + GU) * 3);
    const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.005, 20), brass);
    const tipN = surfaceAt(0.19 * sign, 0.575).n;
    sn.position.fromArray(lp, (Math.round(GV * 0.62) * (GU + 1) + Math.round(GU * 0.8)) * 3);
    sn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipN);
    grp.add(sn);
    return grp;
  }
  collar.add(makeLapel(1), makeLapel(-1));
  parts.hardware = hardware;

  // epaulettes (shoulder straps)
  const epa = new THREE.Group();
  const epShape = new THREE.Shape();
  epShape.moveTo(-0.045, -0.018); epShape.lineTo(0.045, -0.018); epShape.lineTo(0.055, 0); epShape.lineTo(0.045, 0.018); epShape.lineTo(-0.045, 0.018); epShape.closePath();
  const epGeo = new THREE.ExtrudeGeometry(epShape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  whiten(epGeo);
  const epUV = epGeo.attributes.uv;
  for (let i = 0; i < epUV.count; i++) epUV.setXY(i, epUV.getX(i) * 6, epUV.getY(i) * 6);
  [1, -1].forEach((s) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(epGeo, leather);
    g.add(m);
    const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 18), brass);
    sn.rotation.x = Math.PI / 2;
    sn.position.set(0.04, 0, 0.0075);
    g.add(sn);
    g.position.set(0.175 * s, 0.683, 0.0);
    g.rotation.set(-1.5708, 0, 0);
    g.rotation.order = 'YXZ';
    g.rotation.set(-1.5708 + 0.0, 0, 0);
    // lie on the shoulder slope
    g.rotation.set(-Math.PI / 2, 0, 0);
    g.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -0.42 * s);
    if (s < 0) g.scale.x = -1;
    epa.add(g);
  });
  parts.epaulettes = epa;

  // assemble & centre
  const model = new THREE.Group();
  Object.values(parts).forEach((p) => model.add(p));
  model.position.y = -0.37;
  root.add(model);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });

  // ---------- API ----------
  const home = {};
  const dirs = {
    body: [0, 0, 0],
    sleeveR: [1, 0.15, 0.1],
    sleeveL: [-1, 0.15, 0.1],
    collar: [0, 1, 0.4],
    hardware: [0, 0, 1],
    epaulettes: [0, 1.4, 0.2],
  };
  Object.entries(parts).forEach(([k, p]) => (home[k] = p.position.clone()));

  const target = new THREE.Color(0x4a2716);
  const base = new THREE.Color();
  return {
    root,
    model,
    parts,
    setColor(hex) { target.set(hex); },
    setRough(v) {
      leather.userData.rough = v;
    },
    explode(amount) {
      for (const k in parts) {
        const d = dirs[k];
        parts[k].position.set(home[k].x + d[0] * 0.28 * amount, home[k].y + d[1] * 0.2 * amount, home[k].z + d[2] * 0.28 * amount);
      }
    },
    update(dt) {
      base.copy(leather.color);
      leather.color.lerp(target, 1 - Math.exp(-dt * 6));
      const r = leather.userData.rough ?? 0;
      leather.normalScale.setScalar(THREE.MathUtils.lerp(leather.normalScale.x, 0.55 + r * 0.7, 1 - Math.exp(-dt * 5)));
      leather.roughness = THREE.MathUtils.lerp(leather.roughness, 0.52 + r * 0.22, 1 - Math.exp(-dt * 5));
    },
    leather,
  };

  // large wrinkles + baked cavity shading as vertex colours
  function wrinkleAndShade(geo, { seamC, seamRows, amp, freq, seed, sleeve = false }) {
    geo.computeVertexNormals();
    const p = geo.attributes.position, nrm = geo.attributes.normal;
    // average seam normals (first and last column coincide)
    for (let r = 0; r < seamRows; r++) {
      const a = r * seamC, b = a + seamC - 1;
      tmp.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, tmp.x, tmp.y, tmp.z);
      nrm.setXYZ(b, tmp.x, tmp.y, tmp.z);
    }
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const wv = fbm(x * freq + seed, y * freq * 1.3 + seed, z * freq) - 0.5;
      const fine = fbm(x * freq * 3.4 + seed, y * freq * 3.4, z * freq * 3.4) - 0.5;
      let d = wv * amp * 2 + fine * amp * 0.5;
      if (sleeve) d *= 1.0;
      p.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
      const shade = 0.9 + wv * 0.55 + fine * 0.35;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.min(1.12, Math.max(0.62, shade));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    for (let r = 0; r < seamRows; r++) {
      const a = r * seamC, b = a + seamC - 1;
      tmp.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, tmp.x, tmp.y, tmp.z);
      nrm.setXYZ(b, tmp.x, tmp.y, tmp.z);
    }
    geo.computeBoundingSphere();
  }
}
