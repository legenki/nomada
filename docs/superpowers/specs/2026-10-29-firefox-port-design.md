# Firefox version — design

Date: 2026-10-29

## Goal

Ship Nomada on addons.mozilla.org from the same code base: same popup, settings,
spoofing and Auto detection; Firefox-specific routing underneath.

## Decisions

- One code base, build-time target: `TARGET=firefox` → `__TARGET__` constant,
  output `dist-firefox/`, manifest `manifest.firefox.json`. Chrome build unchanged.
- Gecko ID `nomada@legenki.com`, `strict_min_version` 140.0 (MAIN-world content
  scripts need 128; `data_collection_permissions` needs 140).
- `data_collection_permissions.required: ["locationInfo"]` (IP → ipwho.is).
- No PAC profiles on Firefox (option hidden; applying one fails with a message).

## Differences from Chrome

| Area | Chrome | Firefox |
|---|---|---|
| Background | service worker | event page `background.scripts` (+ `type: module`) |
| Routing | `proxy.settings` (fixed / PAC) | `proxy.onRequest` (persistent event — wakes the page) |
| SOCKS5 login | unsupported | `username`/`password` in ProxyInfo, `proxyDNS: true` |
| Auto probe | PAC that routes only ipwho.is | `onRequest` routes only ipwho.is while a probe runs |
| Proxy errors for the probe | `proxy.onProxyError` | `webRequest.onErrorOccurred` on ipwho.is (NS_ERROR_* codes) |
| Auth listener | `asyncBlocking` + callback | `blocking` + Promise |
| Spoof config for the bridge | `storage.session` + `setAccessLevel` | `storage.local` (no `setAccessLevel`) |
| DNR resource types | `chrome.declarativeNetRequest.ResourceType` | explicit Firefox list |
| Host access | granted at install | shown at install but revocable → popup offers "Allow" |

### `onRequest` semantics (from Firefox's ProxyChannelFilter)

- `undefined` → browser's own setting: used while Nomada is off.
- `[proxyInfo, null]` → that proxy and **no failover** (fails closed, never
  direct): used while on.
- `{ type: 'direct' }` → browser default: hosts excluded by routing rules.

The active profile is cached in memory; after the page wakes it's reloaded from
storage before the first answer (the listener may return a Promise).

## Modules

- `src/lib/platform.ts` — `TARGET`, `SOCKS_LOGIN` (Firefox), `SUPPORTS_PAC` (Chrome).
- `src/background/probe-state.ts` — the probe in flight (shared by `detect.ts`
  and the Firefox router, avoiding an import cycle).
- `src/background/firefox-proxy.ts` — pure `proxyInfoFor()` / `routeRequest()`
  (+ routing-rule globs) and `installFirefoxProxy()`.
- `proxy.ts` — `applyProxy()` branches by target; shared `checkServer()`.
- `detect.ts` — `probeOrder(hasLogin, socksLogin)`; the Chrome PAC swap and
  restore only on Chrome; unreachable codes include Firefox's.
- `spoof.ts` / `spoof-bridge.ts` — config area by target; DNR types by target.
- `index.ts` — listeners by target.
- UI — SOCKS5 login allowed and PAC hidden on Firefox; popup asks for host
  access when it's missing (Firefox).

## Build & release

- `npm run build:firefox`, `npm run package:firefox` → `nomada-firefox.zip` +
  `nomada-firefox-source.zip` (`git archive HEAD`, AMO requires sources for
  bundled/minified code), `npm run lint:firefox` (`web-ext lint`),
  `npm run start:firefox` (`web-ext run`).
- `BUILD.md` — reproducible build steps for AMO reviewers.
- `AMO_LISTING.md` — summary, description, categories, reviewer notes.
- `PRIVACY.md` — browser-neutral wording + Firefox notes.

## Testing

- Unit: `proxyInfoFor`, `routeRequest` (off / on fails closed / rules / SOCKS
  login), Firefox probe routing via `onRequest`, `probeOrder` with SOCKS login,
  `validateProfile` with SOCKS login allowed.
- `web-ext lint` clean; manual run in Firefox (HTTP, SOCKS5 with login, dead
  proxy, Auto, spoofing, popup host-access prompt).
