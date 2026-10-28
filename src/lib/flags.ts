import type { Country } from '../types';
import { escHtml } from './html';

// Flags are emoji drawn with a bundled font (src/styles/flags.css): Windows has
// no flag emoji of its own. Twemoji, CC-BY 4.0 — see public/fonts/LICENSE.md.
const FLAG_FONT = '"Twemoji Country Flags"';
const CACHE_PREFIX = 'flag-color:v1:';

/** The flag emoji for an ISO 3166-1 alpha-2 code, or '' for anything else. */
export function flagEmoji(code: string): string {
  const c = code.toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '';
}

/**
 * A flag's main colour from its RGBA pixels: the most common colour once
 * transparent, white, black and grey pixels are left out (they say little
 * about which flag it is). Null when nothing is left.
 */
export function dominantColor(rgba: ArrayLike<number>): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const max = Math.max(r, g, b);
    if (rgba[i + 3] < 200 || max < 40 || max - Math.min(r, g, b) < 40) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const sum = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    sum.n++; sum.r += r; sum.g += g; sum.b += b;
    buckets.set(key, sum);
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const sum of buckets.values()) if (!best || sum.n > best.n) best = sum;
  if (!best) return null;
  const { n } = best;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/** `#rrggbb` → `rgba(r, g, b, alpha)`. */
export function softColor(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── In the page ─────────────────────────────────────────────────────────────

const measured = new Map<string, Promise<string | null>>();

function readCache(code: string): string | undefined {
  try { return localStorage.getItem(CACHE_PREFIX + code) ?? undefined; } catch { return undefined; }
}

async function measure(code: string): Promise<string | null> {
  const emoji = flagEmoji(code);
  if (!emoji) return null;
  const font = `48px ${FLAG_FONT}`;
  await document.fonts.load(font, emoji);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 32);
  const color = dominantColor(ctx.getImageData(0, 0, 64, 64).data);
  // Only real answers are kept, so a font that failed to load is retried next time.
  if (color) try { localStorage.setItem(CACHE_PREFIX + code, color); } catch { /* storage off */ }
  return color;
}

/** The main colour of a country's flag as the bundled font draws it. */
function flagColor(code: string): Promise<string | null> {
  let color = measured.get(code);
  if (!color) {
    color = measure(code);
    measured.set(code, color);
  }
  return color;
}

/** The flag for a proxy's exit country, or a globe while it isn't known yet. */
export function flagHtml(country: Country | undefined): string {
  const emoji = country ? flagEmoji(country.code) : '';
  if (!emoji) {
    return '<span class="flag flag-unknown" title="Country not known yet — it shows up once the proxy is used or checked">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96A14.1 14.1 0 0 1 10.09 16h3.82A14.1 14.1 0 0 1 12 19.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4h-3.38z"/></svg>'
      + '</span>';
  }
  return `<span class="flag" role="img" aria-label="${escHtml(country!.name)}" title="${escHtml(country!.name)}">${emoji}</span>`;
}

/**
 * Give every `[data-flag="<code>"]` element its flag's colour as `--flag` and
 * `--flag-soft`. Cached colours are set right away, so nothing flashes.
 */
export function paintFlags(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-flag]').forEach(el => {
    const code = el.dataset.flag!.toUpperCase();
    const apply = (color: string | null | undefined) => {
      if (!color) return;
      el.style.setProperty('--flag', color);
      el.style.setProperty('--flag-soft', softColor(color, 0.4));
    };
    const cached = readCache(code);
    if (cached) apply(cached);
    else void flagColor(code).then(apply);
  });
}
