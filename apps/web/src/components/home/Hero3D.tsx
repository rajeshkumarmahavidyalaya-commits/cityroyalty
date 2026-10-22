'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ImageDTO } from '@cityroyalty/shared';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/**
 * Scroll-driven 3D jacket hero. The engine (three.js + the glTF jacket) is imported lazily after first paint;
 * until it is ready — or when WebGL / motion is unavailable — the section renders the same copy over a poster.
 * Copy on the three beats is taken from the product description on cityroyalty.in (no invented claims).
 */

type Pose = { x: number; y: number; s: number; ry: number; rx: number; ex: number; f: string | null };
const HERO: Pose[] = [
  { x: 0.3, y: 0.02, s: 1.8, ry: -0.3, rx: 0.04, ex: 0, f: null },
  { x: 0.52, y: 0.0, s: 2.5, ry: -0.2, rx: 0, ex: 0, f: 'zip' },
  { x: 0.3, y: 0.0, s: 1.4, ry: 0.28, rx: 0.05, ex: 1, f: null },
  { x: 0.3, y: 0.0, s: 1.7, ry: 0.5, rx: 0.03, ex: 0, f: null },
];
const PORTRAIT_Y = 0.42;
const PORTRAIT: Pose[] = [
  { x: 0, y: PORTRAIT_Y, s: 1.35, ry: -0.3, rx: 0.04, ex: 0, f: null },
  { x: 0, y: PORTRAIT_Y, s: 2.1, ry: -0.2, rx: 0, ex: 0, f: 'zip' },
  { x: 0, y: PORTRAIT_Y, s: 1.2, ry: 0.28, rx: 0.05, ex: 1, f: null },
  { x: 0, y: PORTRAIT_Y, s: 1.3, ry: 0.5, rx: 0.03, ex: 0, f: null },
];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const KEYS = [0, 0.34, 0.68, 1];

export const BEATS = [
  { eyebrow: 'City Royalty', title: 'Wear a higher standard.', body: 'Timeless leather. Modern expression.' },
  { eyebrow: 'Details', title: 'Details that work hard.', body: 'Brass zippered pockets keep contents secure; interior slip pockets organise your smaller essentials.' },
  { eyebrow: 'Construction', title: 'Made for the ride.', body: 'A padded thin-fibre layer provides safety and helps maintain body temperature — for a ride or an outing.' },
  { eyebrow: 'The collection', title: 'A royal, unmatched look.', body: 'Biker, classic and women’s cuts in leather, made for work or a weekend getaway.' },
];

export function Hero3D({ poster }: { poster: ImageDTO | null }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const dotEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [mode, setMode] = useState<'pending' | '3d' | 'static'>('pending');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    let gl = false;
    try {
      const c = document.createElement('canvas');
      const ctx = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
      gl = !!ctx;
      // Software rasterisers (SwiftShader/llvmpipe, e.g. headless or GPU-less machines) cannot sustain a 3D scene:
      // show the static hero there instead of freezing the page. NEXT_PUBLIC_FORCE_3D=1 overrides (used by e2e).
      const info = ctx?.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? String(ctx!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (gl && process.env.NEXT_PUBLIC_FORCE_3D !== '1' && /swiftshader|llvmpipe|software/i.test(renderer)) gl = false;
    } catch {
      gl = false;
    }
    setMode(reduce || saveData || !gl ? 'static' : '3d');
  }, []);

  useEffect(() => {
    if (mode !== '3d') return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    const boot = async () => {
      const [THREE, { loadJackets }, { buildStudioEnvironment, addStudioLights }] = await Promise.all([
        import('three'),
        import('@/three/jacket.js') as Promise<{ loadJackets: (o: object) => Promise<any> }>,
        import('@/three/studio.js') as Promise<{ buildStudioEnvironment: (r: any) => any; addStudioLights: (s: any) => void }>,
      ]);
      if (disposed || !canvas.current || !section.current) return;
      const el = canvas.current;
      const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true, stencil: false, powerPreference: 'high-performance' });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 0.02, 3.6);
      scene.environment = buildStudioEnvironment(renderer);
      scene.environmentIntensity = 1.8;
      addStudioLights(scene);
      const warm = new THREE.PointLight(0xffe2b8, 1.0, 8);
      warm.position.set(1.5, -0.4, 2.2);
      scene.add(warm);

      const jacket = await loadJackets({ first: 'biker', maxAniso: renderer.capabilities.getMaxAnisotropy() });
      if (disposed) {
        renderer.dispose();
        return;
      }
      const rig = new THREE.Group();
      rig.add(jacket.root);
      scene.add(rig);
      jacket.setColor('#4a2716');
      jacket.update(10);

      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = 0, h = 0;
      const resize = () => {
        w = el.clientWidth;
        h = el.clientHeight;
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      jacket.warmUp(renderer, scene, camera);

      let visible = true;
      const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting), { rootMargin: '100px' });
      io.observe(section.current);

      // pointer parallax (desktop)
      const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / innerWidth - 0.5) * 2;
        pointer.y = (e.clientY / innerHeight - 0.5) * 2;
      };
      addEventListener('pointermove', onMove, { passive: true });

      const cur: Pose & { fx: number; fy: number; fz: number } = { ...HERO[0]!, fx: 0, fy: 0, fz: 0 };
      let clock = 0, last = performance.now(), slow = 0, frames = 0;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden) {
          last = now;
          return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        clock += dt;

        // scroll progress through the sticky section
        const r = section.current!.getBoundingClientRect();
        const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
        let k = 0;
        while (k < KEYS.length - 2 && p > KEYS[k + 1]!) k++;
        const t = ease(clamp((p - KEYS[k]!) / (KEYS[k + 1]! - KEYS[k]!)));
        const portrait = w / h < 0.95;
        const table = portrait ? PORTRAIT : HERO;
        const a = table[k]!, b = table[k + 1]!;
        // focus target of whichever beat is nearer, blended
        const fa = a.f ? jacket.focus(a.f) : { x: 0, y: 0, z: 0 };
        const fb = b.f ? jacket.focus(b.f) : { x: 0, y: 0, z: 0 };
        const mix = (u: number, v: number) => u + (v - u) * t;
        const target = {
          x: mix(a.x, b.x), y: mix(a.y, b.y), s: mix(a.s, b.s), ry: mix(a.ry, b.ry), rx: mix(a.rx, b.rx), ex: mix(a.ex, b.ex),
          fx: mix(fa.x, fb.x), fy: mix(fa.y, fb.y), fz: mix(fa.z, fb.z),
        };
        const sm = 1 - Math.exp(-dt * 9);
        for (const key of Object.keys(target) as (keyof typeof target)[]) (cur as any)[key] += (target[key] - (cur as any)[key]) * sm;

        const aspect = w / h;
        const halfW = halfH * aspect;
        const fit = portrait ? 1 : clamp((aspect + 0.1) / 1.1, 0.5, 1);
        pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
        pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
        rig.position.set(cur.x * halfW, cur.y + Math.sin(clock * 0.9) * 0.012, 0);
        rig.scale.setScalar(Math.max(0.0001, cur.s * fit));
        rig.rotation.set(cur.rx - pointer.sy * 0.05, cur.ry + Math.sin(clock * 0.5) * 0.06 + pointer.sx * 0.18, 0);
        jacket.root.position.set(-cur.fx, -cur.fy, -cur.fz);
        jacket.explode(cur.ex);
        jacket.update(dt);
        scene.environmentRotation.y = pointer.sx * 0.4 + Math.sin(clock * 0.18) * 0.25;
        renderer.render(scene, camera);

        // copy beats fade with the same progress
        beatEls.current.forEach((be, i) => {
          if (!be) return;
          const c = KEYS[i]!;
          const half = 0.17;
          const op = i === 0 ? clamp(1 - (p - c - 0.06) / 0.1) : i === KEYS.length - 1 ? clamp((p - (c - 0.14)) / 0.1) : clamp(1 - Math.abs(p - c) / half);
          be.style.opacity = String(op);
          be.style.transform = `translate3d(0, ${(1 - op) * 18}px, 0)`;
          be.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
        });
        dotEls.current.forEach((d, i) => d && (d.style.opacity = String(Math.abs(p - KEYS[i]!) < 0.17 ? 1 : 0.3)));

        // adaptive resolution: back off on weak GPUs instead of dropping frames
        frames++;
        if (dt > 0.026) slow++;
        if (frames === 40) {
          if (slow > 22 && dpr > 1) {
            dpr = Math.max(1, dpr - 0.25);
            resize();
          }
          frames = slow = 0;
        }
      };
      raf = requestAnimationFrame(loop);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        removeEventListener('pointermove', onMove);
        renderer.dispose();
      };
    };

    const start = () => boot().catch((e) => { console.warn('3D hero unavailable', e); if (!disposed) setMode('static'); });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
    const id = ric ? ric(start, { timeout: 1500 }) : window.setTimeout(start, 200);
    return () => {
      disposed = true;
      (window as unknown as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id as number);
      clearTimeout(id as number);
      cleanup();
    };
  }, [mode]);

  const first = BEATS[0]!;
  const copy = (b: (typeof BEATS)[number], i: number) => (
    <div
      key={i}
      ref={(el) => { beatEls.current[i] = el; }}
      className="absolute inset-x-0 bottom-[7svh] px-5 will-change-[opacity,transform] md:bottom-auto md:top-1/2 md:max-w-[34rem] md:-translate-y-1/2 md:px-0 md:pl-[max(1.5rem,5vw)]"
      style={{ opacity: i === 0 ? 1 : 0 }}
    >
      <p className="eyebrow text-stone">{b.eyebrow}</p>
      {i === 0 ? (
        <h1 className="mt-3 text-[2.6rem] leading-[1.02] md:text-[5.2rem]">{b.title}</h1>
      ) : (
        <h2 className="mt-3 text-[2.2rem] leading-[1.05] md:text-6xl">{b.title}</h2>
      )}
      <p className="mt-4 max-w-md text-[0.95rem] text-ivory/80 md:text-lg">{b.body}</p>
      {(i === 0 || i === BEATS.length - 1) && (
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/collections/all" className="btn btn-light">Explore collection</Link>
          {i === BEATS.length - 1 && <Link href="/collections/mens-jacket" className="btn btn-ghost !border-ivory !text-ivory hover:!bg-ivory hover:!text-royal">Men’s jackets</Link>}
        </div>
      )}
    </div>
  );

  if (mode === 'static') {
    return (
      <section className="on-dark relative -mt-16 overflow-hidden bg-royal text-ivory md:-mt-20" aria-label="City Royalty">
        <div className="container-x grid min-h-svh items-center gap-10 pb-16 pt-32 md:grid-cols-2">
          <div>
            <p className="eyebrow text-stone">{first.eyebrow}</p>
            <h1 className="mt-3 text-[2.8rem] leading-[1.02] md:text-[5.2rem]">{first.title}</h1>
            <p className="mt-4 max-w-md text-ivory/80 md:text-lg">{first.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/collections/all" className="btn btn-light">Explore collection</Link>
            </div>
          </div>
          {poster && <ResponsiveImage image={poster} sizes="(min-width:768px) 45vw, 100vw" ratio="4 / 5" priority className="md:ml-auto md:max-w-md" />}
        </div>
      </section>
    );
  }

  return (
    <section ref={section} className="on-dark relative -mt-16 h-[420svh] bg-royal text-ivory md:-mt-20" aria-label="City Royalty" data-hero-3d>
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 68% 48%, #3a2519 0%, #160f0b 55%, #080808 100%)' }} aria-hidden />
        {mode === '3d' && <canvas ref={canvas} className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`} aria-hidden />}
        {poster && !ready && (
          <div className="absolute inset-0 hidden opacity-25 md:block" aria-hidden>
            <ResponsiveImage image={poster} sizes="50vw" ratio="auto" className="!absolute inset-y-0 right-0 w-1/2" />
          </div>
        )}
        {BEATS.map(copy)}
        <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex" aria-hidden>
          {BEATS.map((_, i) => (<span key={i} ref={(el) => { dotEls.current[i] = el; }} className="h-5 w-px bg-ivory transition-opacity" style={{ opacity: i === 0 ? 1 : 0.3 }} />))}
        </div>
        <p className="eyebrow pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-stone/80 md:block" aria-hidden>Scroll</p>
      </div>
    </section>
  );
}
