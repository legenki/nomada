# Country flags instead of profile colours — design

Date: 2026-10-29

## Goal

Drop the colour picker. Each proxy shows the flag of its exit IP's country, and
its card border takes the flag's main colour.

## Data

- `ProxyProfile.exitCountry?: { code, name }` — ISO alpha-2 code and country
  name of the proxy's exit IP, remembered on the profile. Optional, so no
  migration. `color` stays in storage for compatibility but is no longer shown.
- Written when:
  - a proxy is saved with Auto (from the detection result);
  - the background stores the active proxy's place (`withProxyPlace()` in
    `state-helpers.ts`, used by `refreshProxyPlace`) — keeps rotating proxies
    current.
- Cleared when the user changes type, host, port or PAC URL by hand (a
  different server); kept otherwise.

## Flags

- Rendered as flag emoji (`flagEmoji(code)`) in the bundled **Twemoji Country
  Flags** font (`public/fonts/TwemojiCountryFlags.woff2`, from
  `country-flag-emoji-polyfill` 0.1.10), declared in `src/styles/flags.css` with a
  flag-only `unicode-range`, so flags look the same on every OS incl. Windows.
- Unknown country → muted globe icon.
- Attribution: `public/fonts/LICENSE.md` + a footer line on the settings page.

## Colour

- `flagColor(code)`: draw the flag on a 64×64 canvas with the bundled font and
  take `dominantColor()` — the most common colour after dropping transparent,
  white, black and grey pixels (3-bit buckets, averaged). Memoised and cached in
  `localStorage` (`flag-color:v1:<code>`); only non-null results are cached.
- `paintFlags(root)`: sets `--flag` / `--flag-soft` (40 % alpha) on every
  `[data-flag]` element — synchronously when cached, so there's no flash.
- Borders, popup and settings alike: every card `var(--flag-soft, var(--line))`;
  the selected one `var(--flag, …)`, falling back to today's look without a flag.

## Removed

Colour swatches, custom colour, "next unused colour" in the dialog.

## Testing

- `tests/flags.test.ts`: `flagEmoji`, `dominantColor`, `softColor`.
- `tests/state-transitions.test.ts`: `withProxyPlace` stores the place and the
  profile's exit country, leaves other profiles alone.
- Browser check of both pages with flags, borders and the unknown-country icon.
