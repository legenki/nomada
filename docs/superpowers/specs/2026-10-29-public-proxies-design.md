# Public proxy gallery — design

Date: 2026-10-29

## Goal

Below "Proxies" on the settings page, offer a gallery of public proxies from
TheSpeedX/SOCKS-List — only working ones, by country and type — that can be
added or used with one click. No server of our own.

## Why a checker

TheSpeedX lists are `ip:port` only: no country, nothing verified (938 entries sit
in both the HTTP and SOCKS5 files), most entries dead. Browsers can't test
thousands of proxies, so a scheduled GitHub Actions job does it and publishes a
small JSON file the extension downloads.

## Checker — `tools/proxy-list/`

TypeScript run by Node 24 (type stripping, no dependencies), own `tsconfig.json`
(Node types), tests next to it (Vitest).

1. Fetch `http.txt` and `socks5.txt`; parse IPv4 `host:port`; merge into
   candidates with the type(s) each was listed as.
2. For each candidate and listed type, ask `https://api.ipify.org?format=json`
   through it: HTTP → `CONNECT`; SOCKS5 → no-auth handshake with the host name;
   then TLS + `GET`. Timeout 5 s, 200 at a time. Result: exit IP + latency.
3. Country of the exit IP from DB-IP IP-to-Country Lite (CC-BY 4.0), downloaded
   once a month (current month, else the previous one) and cached; `ZZ` = unknown
   → dropped.
4. Write `proxies.json` (working only, fastest first, at most 1000):
   ```json
   { "updatedAt": "2026-10-29T09:20:00Z", "source": "TheSpeedX/SOCKS-List",
     "proxies": [{ "type": "http", "host": "185.199.110.42", "port": 8080, "country": "DE", "ms": 180 }] }
   ```

CLI: `node tools/proxy-list/main.ts --out out/proxies.json [--limit 50]`.

## Publishing — `.github/workflows/proxy-list.yml`

Every 6 hours + manual run. Checkout, Node 24, cache DB-IP by month, run the
checker, force-push `proxies.json` as the only file of the orphan branch
`proxy-list` (main's history stays clean). Served from
`https://raw.githubusercontent.com/legenki/nomada/proxy-list/proxies.json`
(CORS `*`, 5-minute cache).

## Extension

- `src/lib/public-proxies.ts`: `parsePublicList()` (validates untrusted JSON),
  `loadPublicList({ force })` (cache in `storage.local`, refetch after 3 h or on
  ↻, keep the cached copy if the network fails), `filterPublic()` (type, country,
  sort by speed or country), `countryCounts()`, `publicProfile()`.
- Settings page, new section "Public proxies · N working · updated 2 h ago ↻":
  dismissible warning (run by strangers — don't sign in or pay), type segments
  All/HTTP/SOCKS5, sort (fastest / by country), country rail (flag + count),
  card grid (flag, country, `host:port`, type, speed dot: <1 s green, <2.5 s
  amber, else red — public proxies are slow; border in the flag colour), 24 at a time + "Show more",
  credits (TheSpeedX/SOCKS-List, IP geolocation by DB-IP).
- Card buttons: **+ Add** → saved as a profile named after the country
  ("Germany"), `exitCountry` set, `tags: ['public']`; **Use** → add if needed, then
  `SELECT_PROFILE` + `ENABLE`. Cards already in "My proxies" show "Added".
- "My proxies" cards with the `public` tag get a "Public" badge.
- Same in Chrome and Firefox.

## Privacy & stores

`PRIVACY.md`: the settings page downloads the list from GitHub (no user data
sent). Store descriptions: the gallery, with the warning. Firefox
`data_collection_permissions` unchanged.

## Testing

- Checker: list parsing/merging, geo table lookup, output building, `checkProxy`
  against in-process fake HTTP-CONNECT and SOCKS5 proxies (plain-HTTP echo target),
  dead port, wrong protocol, timeout.
- Extension: `parsePublicList`, `filterPublic`, `countryCounts`, `publicProfile`,
  cache freshness in `loadPublicList`.
- Local trial run of the checker on ~50 real entries; after the first workflow
  run, the branch exists and the file downloads.
