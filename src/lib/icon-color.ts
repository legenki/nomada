// Reference RGB for each prebuilt icon colour variant in public/icons.
const ICON_COLOR_RGB: Record<string, [number, number, number]> = {
  blue:   [9, 105, 218],
  gray:   [128, 128, 128],
  green:  [26, 127, 55],
  orange: [219, 109, 40],
  purple: [137, 87, 229],
  red:    [207, 34, 46],
  teal:   [23, 162, 184],
  yellow: [212, 153, 34],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  const m = /^([0-9a-f]{6})$/i.exec(clean);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Map an arbitrary profile colour (hex) to the nearest prebuilt icon colour
 * name, so the toolbar icon can be tinted to roughly match the profile.
 * Returns null for unparseable input (caller falls back to the default).
 */
export function nearestIconColor(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [name, ref] of Object.entries(ICON_COLOR_RGB)) {
    const d = (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}
