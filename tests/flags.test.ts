import { describe, it, expect } from 'vitest';
import { dominantColor, flagEmoji, softColor } from '../src/lib/flags';

/** RGBA pixels: `n` copies of each [r, g, b, a]. */
function pixels(...runs: [n: number, rgba: [number, number, number, number]][]): Uint8ClampedArray {
  return Uint8ClampedArray.from(runs.flatMap(([n, px]) => Array.from({ length: n }, () => px).flat()));
}

describe('flagEmoji', () => {
  it('turns a country code into regional indicator symbols', () => {
    expect(flagEmoji('DE')).toBe('🇩🇪');
    expect(flagEmoji('jp')).toBe('🇯🇵');
  });

  it('returns nothing for anything that is not a two-letter code', () => {
    for (const code of ['', 'D', 'DEU', '12', 'D1']) expect(flagEmoji(code), code).toBe('');
  });
});

describe('dominantColor', () => {
  it('picks the most common colour, ignoring transparent, white, black and grey', () => {
    expect(dominantColor(pixels(
      [50, [255, 255, 255, 255]], // white
      [40, [0, 0, 0, 255]],       // black
      [30, [128, 128, 128, 255]], // grey
      [20, [0, 0, 255, 0]],       // transparent blue
      [12, [188, 0, 45, 255]],    // red
      [8, [0, 56, 168, 255]],     // blue
    ))).toBe('#bc002d');
  });

  it('averages the shades that fall into the winning colour', () => {
    expect(dominantColor(pixels([1, [200, 10, 40, 255]], [1, [210, 20, 50, 255]]))).toBe('#cd0f2d');
  });

  it('has no colour for a flag drawn only in white, black and grey', () => {
    expect(dominantColor(pixels([10, [255, 255, 255, 255]], [10, [20, 20, 20, 255]]))).toBeNull();
    expect(dominantColor(new Uint8ClampedArray())).toBeNull();
  });
});

describe('softColor', () => {
  it('makes a translucent rgba() from a hex colour', () => {
    expect(softColor('#bc002d', 0.4)).toBe('rgba(188, 0, 45, 0.4)');
  });
});
