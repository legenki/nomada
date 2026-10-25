import { geoOrthographic, geoPath, geoEquirectangular, geoInterpolate, geoDistance, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeoPermissibleObjects } from 'd3-geo';

export interface LatLon { lat: number; lon: number }

export interface GlobeScene {
  real: LatLon | null;
  proxy: LatLon | null;
  /** Proxy route is live: draw the arc and the proxy marker as the focus. */
  active: boolean;
  /** Waiting for the proxy to answer: the arc pulses. */
  connecting: boolean;
}

interface Palette {
  dot: string; sphere: string; sphereEdge: string; accent: string; muted: string;
  glow: string; glowFade: string; glowOn: string; glowOnFade: string;
}

/** Same colour with zero alpha. Canvas gradients to 'transparent' fade through black. */
export function fade(color: string): string {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map(x => x.trim());
    return `rgba(${r},${g},${b},0)`;
  }
  const clean = color.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r},${g},${b},0)`;
  }
  const hex6 = /^([0-9a-f]{6})/i.exec(clean);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
  }
  return 'rgba(0,0,0,0)';
}

const DOT_STEP_DEG = 2.3;   // spacing of the land dot grid
const FRAME_MS = 1000 / 40; // cap the loop; it's a popup, not a game
const EASE_MS = 1100;

/** Unit vector for a lon/lat in degrees. */
function vec(lon: number, lat: number): [number, number, number] {
  const l = lon * Math.PI / 180, p = lat * Math.PI / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Globe {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly proj: GeoProjection;
  private readonly size: number;
  private readonly dpr: number;
  private readonly r: number;

  /** Land dots: lon, lat and unit vector, precomputed once. */
  private dots: { lon: number; lat: number; v: [number, number, number] }[] = [];
  private palette: Palette;
  private scene: GlobeScene = { real: null, proxy: null, active: false, connecting: false };

  // View rotation as [lambda, phi] (d3 rotate), eased toward a focus point.
  private view: [number, number] = [0, -10];
  private from: [number, number] = [0, -10];
  private to: [number, number] = [0, -10];
  private easeStart = 0;
  private dragging: { x: number; y: number; view: [number, number] } | null = null;
  private resumeAt = 0;

  private raf: number | null = null;
  private lastFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement, size: number) {
    this.ctx = canvas.getContext('2d')!;
    this.size = size;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.height = size * this.dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    this.r = size * 0.38; // leaves room for the glow inside the canvas
    this.proj = geoOrthographic().scale(this.r).translate([size / 2, size / 2]).clipAngle(90).precision(0.5);
    this.palette = this.readPalette();
    this.bindDrag();
  }

  /** Rasterise land once and keep the grid points that fall on it. */
  async loadLand(url: string): Promise<void> {
    const world = await (await fetch(url)).json();
    const land = feature(world, world.objects.land) as unknown as GeoPermissibleObjects;

    const W = 720, H = 360;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    const eq = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    octx.beginPath();
    geoPath(eq, octx)(land);
    octx.fill();
    const pixels = octx.getImageData(0, 0, W, H).data;

    const dots: typeof this.dots = [];
    for (let lat = -82; lat <= 84; lat += DOT_STEP_DEG) {
      const ring = Math.max(1, Math.round((360 * Math.cos(lat * Math.PI / 180)) / DOT_STEP_DEG));
      for (let i = 0; i < ring; i++) {
        const lon = -180 + (i + 0.5) * (360 / ring);
        const px = Math.floor(((lon + 180) / 360) * W);
        const py = Math.floor(((90 - lat) / 180) * H);
        if (pixels[(py * W + px) * 4 + 3] > 0) dots.push({ lon, lat, v: vec(lon, lat) });
      }
    }
    this.dots = dots;
  }

  setScene(scene: GlobeScene): void {
    const focus = this.focusOf(scene);
    this.scene = scene;
    if (focus) this.easeTo([-focus.lon, -focus.lat]);
  }

  /** Re-read colours (e.g. after a light/dark switch). */
  refreshPalette(): void {
    this.palette = this.readPalette();
  }

  start(): void {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (now - this.lastFrame < FRAME_MS) return;
      this.lastFrame = now;
      this.tick(now);
      this.draw(now);
    };
    if (this.raf === null) this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private readPalette(): Palette {
    const css = getComputedStyle(this.canvas);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      dot: v('--globe-dot', '#7c8794'),
      sphere: v('--globe-sphere', '#f4f6f9'),
      sphereEdge: v('--globe-sphere-edge', '#dfe4ea'),
      glow: v('--globe-glow', 'rgba(120,150,190,0.35)'),
      glowFade: fade(v('--globe-glow', 'rgba(120,150,190,0.35)')),
      glowOn: v('--globe-glow-on', 'rgba(22,163,74,0.3)'),
      glowOnFade: fade(v('--globe-glow-on', 'rgba(22,163,74,0.3)')),
      accent: v('--globe-accent', '#1f9d55'),
      muted: v('--globe-muted', '#5b6673'),
    };
  }

  /** Centre on the proxy when active; frame both ends of the trip when they fit. */
  private focusOf(scene: GlobeScene): LatLon | null {
    const { real, proxy } = scene;
    if ((scene.active || scene.connecting) && proxy) {
      if (real && geoDistance([real.lon, real.lat], [proxy.lon, proxy.lat]) < 1.6) {
        const [lon, lat] = geoInterpolate([real.lon, real.lat], [proxy.lon, proxy.lat])(0.5);
        return { lon, lat };
      }
      return proxy;
    }
    return real ?? proxy;
  }

  private easeTo(target: [number, number]): void {
    this.from = [...this.view];
    // Take the short way round in longitude.
    const d = ((target[0] - this.view[0]) % 360 + 540) % 360 - 180;
    this.to = [this.view[0] + d, Math.max(-60, Math.min(60, target[1]))];
    this.easeStart = performance.now();
  }

  private tick(now: number): void {
    if (this.dragging) return;
    if (now < this.resumeAt) return;
    if (this.resumeAt && now >= this.resumeAt) {
      this.resumeAt = 0;
      const focus = this.focusOf(this.scene);
      if (focus) this.easeTo([-focus.lon, -focus.lat]);
    }
    const t = Math.min(1, (now - this.easeStart) / EASE_MS);
    const k = easeInOut(t);
    this.view = [this.from[0] + (this.to[0] - this.from[0]) * k, this.from[1] + (this.to[1] - this.from[1]) * k];
  }

  private draw(now: number): void {
    const { ctx, proj, size, r, palette: c } = this;
    const cx = size / 2, cy = size / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    proj.rotate([this.view[0], this.view[1], 0]);

    // Atmosphere glow behind the sphere, tinted while the proxy route is live.
    const on = this.scene.active;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.3);
    glow.addColorStop(0, on ? c.glowOn : c.glow);
    glow.addColorStop(1, on ? c.glowOnFade : c.glowFade);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2); ctx.fill();

    // Sphere body, lit from the top-left.
    const body = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    body.addColorStop(0, c.sphere);
    body.addColorStop(1, c.sphereEdge);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // Land dots, fading and shrinking toward the limb for depth.
    const center = vec(-this.view[0], -this.view[1]);
    ctx.fillStyle = c.dot;
    for (const d of this.dots) {
      const cos = d.v[0] * center[0] + d.v[1] * center[1] + d.v[2] * center[2];
      if (cos <= 0.02) continue;
      const p = proj([d.lon, d.lat]);
      if (!p) continue;
      ctx.globalAlpha = 0.18 + 0.72 * cos;
      const s = 0.55 + 0.75 * cos;
      ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    const { real, proxy, active, connecting } = this.scene;
    if (real && proxy && (active || connecting)) this.drawArc(real, proxy, now, connecting);
    if (real) this.drawMarker(real, active || connecting ? c.muted : c.accent, !(active || connecting), now, 0.75);
    if (proxy && (active || connecting)) this.drawMarker(proxy, c.accent, true, now, 1);
  }

  /** Visible screen point for a lon/lat, or null on the far side. */
  private screen(lon: number, lat: number): [number, number] | null {
    const center: [number, number] = [-this.view[0], -this.view[1]];
    if (geoDistance([lon, lat], center) > Math.PI / 2) return null;
    return this.proj([lon, lat]);
  }

  private drawMarker(at: LatLon, color: string, pulse: boolean, now: number, scale: number): void {
    const p = this.screen(at.lon, at.lat);
    if (!p) return;
    const { ctx } = this;
    if (pulse) {
      const phase = (now % 2200) / 2200;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4 + phase * 14, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = (1 - phase) * 0.55;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(p[0], p[1], 5.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** Great-circle arc lifted off the surface, with a light pulse travelling to the proxy. */
  private drawArc(from: LatLon, to: LatLon, now: number, connecting: boolean): void {
    const { ctx, palette: c, size } = this;
    const cx = size / 2, cy = size / 2;
    const interp = geoInterpolate([from.lon, from.lat], [to.lon, to.lat]);
    const dist = geoDistance([from.lon, from.lat], [to.lon, to.lat]);
    const lift = Math.min(0.28, 0.06 + dist * 0.12);
    const N = 64;
    const pts: ([number, number] | null)[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const [lon, lat] = interp(t);
      const p = this.screen(lon, lat);
      if (!p) { pts.push(null); continue; }
      const h = 1 + lift * Math.sin(Math.PI * t);
      pts.push([cx + (p[0] - cx) * h, cy + (p[1] - cy) * h]);
    }

    const stroke = (alpha: number, width: number, from = 0, to = N) => {
      ctx.beginPath();
      let pen = false;
      for (let i = from; i <= to; i++) {
        const p = pts[i];
        if (!p) { pen = false; continue; }
        if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.strokeStyle = c.accent;
      ctx.stroke();
    };

    ctx.lineCap = 'round';
    stroke(connecting ? 0.25 + 0.2 * Math.sin(now / 180) : 0.35, 1.4);
    // Travelling pulse.
    const head = Math.floor(((now % 1800) / 1800) * (N + 12));
    stroke(0.95, 2.2, Math.max(0, head - 12), Math.min(N, head));
    ctx.globalAlpha = 1;
  }

  private bindDrag(): void {
    const el = this.canvas;
    el.addEventListener('pointerdown', e => {
      this.dragging = { x: e.clientX, y: e.clientY, view: [...this.view] };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const k = 180 / (Math.PI * this.r);
      this.view = [
        this.dragging.view[0] + (e.clientX - this.dragging.x) * k,
        Math.max(-70, Math.min(70, this.dragging.view[1] - (e.clientY - this.dragging.y) * k)),
      ];
    });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = null;
      this.from = [...this.view];
      this.to = [...this.view];
      this.resumeAt = performance.now() + 1600; // then glide back to the focus
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
