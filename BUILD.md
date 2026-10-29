# Building Nomada

The extension is written in TypeScript and bundled with [Vite](https://vitejs.dev)
(open source). One code base builds both browser versions; `TARGET=firefox`
selects the Firefox manifest and the Firefox-specific code paths at build time.

## Requirements

- Node.js 20 or later and npm (released builds were made with Node 26.12.1 and npm 11.20.0)
- A Unix shell with `zip` and `git` (only for the packaging scripts)

## Firefox (addons.mozilla.org)

```sh
npm ci
npm run build:firefox
```

`dist-firefox/` is the extension — the same files as in `nomada-firefox.zip`.
`npm run package:firefox` builds it and writes `nomada-firefox.zip` plus
`nomada-firefox-source.zip` (this repository at `HEAD`, for review).

`npm run lint:firefox` runs `web-ext lint`; `npm run start:firefox` opens a
Firefox profile with the built extension loaded.

## Chrome (Chrome Web Store)

```sh
npm ci
npm run build      # → dist/
npm run package    # → nomada-extension.zip
```

## What ends up in the package

| Output | Built from |
|---|---|
| `background.js` | `src/background/` |
| `spoof-main.js`, `spoof-bridge.js` | `src/content/` |
| `popup.html/js/css` | `src/popup/`, `src/styles/` |
| `options.html/js/css` | `src/options/`, `src/styles/` |
| `manifest.json` | `manifest.firefox.json` (Firefox) or `manifest.json` (Chrome) |
| `icons/`, `land-110m.json`, `fonts/` | copied as is from `public/` |

Third-party code bundled in: `d3-geo` and `topojson-client` (versions pinned in
`package-lock.json`). `public/land-110m.json` is static map data (TopoJSON land
outlines). `public/fonts/TwemojiCountryFlags.woff2` is the Twemoji flag font,
see `public/fonts/LICENSE.md`.

`tools/proxy-list/` is not part of the package: it runs in GitHub Actions
(`.github/workflows/proxy-list.yml`) and publishes the public proxy list that
the settings page downloads.

`npm test` runs the unit tests (Vitest).
