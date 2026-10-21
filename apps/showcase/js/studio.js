import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Photo-studio lighting for the leather.
 *  Instead of a generic room, the reflections come from a small set of big
 *  soft boxes in a dark studio, the way a product photographer would light
 *  a jacket: a large key, a strip rim from behind, an overhead and a low
 *  warm bounce. Leather's glossy highlights then read as long soft streaks.
 * ------------------------------------------------------------------ */

function box(w, h, color, intensity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
  );
  return m;
}

export function buildStudioEnvironment(renderer) {
  const s = new THREE.Scene();

  // dark studio shell with a faint vertical gradient so unlit reflections are not pure black
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y * 0.5 + 0.5; vec3 c = mix(vec3(0.020,0.016,0.014), vec3(0.075,0.062,0.052), h); gl_FragColor = vec4(c, 1.0); }',
    })
  );
  s.add(shell);

  // key: big warm soft box, upper left in front
  const key = box(14, 10, 0xfff0dc, 5.5);
  key.position.set(-11, 9, 12); key.lookAt(0, 0, 0); s.add(key);
  // fill: large dim panel, right front
  const fill = box(12, 12, 0xe8eeff, 1.1);
  fill.position.set(14, 1, 11); fill.lookAt(0, 0, 0); s.add(fill);
  // rim strips: tall cool lights behind left and right, they draw the silhouette
  const rimL = box(3, 16, 0xcfe0ff, 7);
  rimL.position.set(-13, 2, -11); rimL.lookAt(0, 0, 0); s.add(rimL);
  const rimR = box(3, 16, 0xcfe0ff, 6);
  rimR.position.set(13, 2, -10); rimR.lookAt(0, 0, 0); s.add(rimR);
  // overhead: soft top light that gives shoulders and sleeves a long highlight
  const top = box(16, 8, 0xffffff, 3.2);
  top.position.set(0, 15, 2); top.rotation.x = Math.PI / 2; s.add(top);
  // low warm bounce, like a card on the floor
  const bounce = box(16, 5, 0xffd9b0, 1.2);
  bounce.position.set(0, -9, 9); bounce.lookAt(0, 0, 0); s.add(bounce);

  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture;
  pm.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

/** a few direct lights on top of the environment for crisp specular glints */
export function addStudioLights(scene) {
  const key = new THREE.DirectionalLight(0xfff1de, 1.1);
  key.position.set(-2.5, 3, 3.5);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 0.9);
  rim.position.set(3, 1.5, -3);
  scene.add(key, rim);
  return { key, rim };
}
