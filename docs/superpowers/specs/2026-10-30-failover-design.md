# Failover and the Direct / Proxy switch — design

Date: 2026-10-30
Mockups: `docs/mockups/failover-*.png`

## Goal

If the proxy in use stops answering, Nomada moves to the next one in the user's
order, and the browser's location, timezone and language move with it. This is
failover, not multi-hop: traffic always goes through one proxy.

## Switching is done by Nomada, not the browser

Browsers can fail over by themselves (a PAC list, a Firefox ProxyInfo array), but
Nomada would learn about it late and sites would see the backup's IP with the old
proxy's timezone. So each profile is applied on its own: requests during the
switch fail, they never leave directly or with a mismatched identity.

## Data

`WooPortalData.failover?` (optional, no migration):
`{ enabled, order: id[], down: id[], moved?: { from, to }, exhausted? }`.

- The chain is `order`, then any other profiles; PAC profiles never take part.
- `activeProfileId` stays what's carrying traffic.
- `exitCountry` gains optional `lat`/`lon` so backups can be drawn on the globe;
  proxies never used yet (e.g. from the public gallery) have no point.

## Behaviour (`src/background/failover.ts`)

- **Trigger:** `proxy.onProxyError` (Chrome); `webRequest.onErrorOccurred` with
  `proxyInfo` and a connection-level `NS_ERROR_*` (Firefox). Ignored during an Auto
  check, while another check runs, for 30 s after the last one, and when offline.
- **Verify:** one error may be one site's, so ask ipwho.is through the proxy, twice.
- **Move on:** select the next proxy after the active one (wrapping round), look up
  its exit, and apply proxy + identity. Silent → the next one.
- **All silent while protected:** back to the last proxy whose identity the pages
  have, `exhausted` set. Nomada stays on and traffic stays blocked: turning off would
  expose the real IP. Popup explains and offers Try again; Direct is the user's call.
  Opening the popup also retries.
- **All silent right after choosing Proxy:** stays off with a message, as today (the
  user was on Direct a moment ago).
- **Going back:** never automatic. Direct resets the selection to the first in the
  chain, so Proxy starts from the top. A manual pick is respected.

## Popup

- Header: `Direct | Proxy` replaces the toggle (same ENABLE / DISABLE). Accent only here.
- `Single | Failover` next to "Proxy". Failover rows: order number, flag, name, tag
  (`ACTIVE`, `BACKUP`, `NEXT` on Direct, `NO ANSWER`), drag handle (arrow keys too),
  "+ Add backup" (opens settings), hint line.
- Status `Protected · via X`; a note after an automatic move; a warning state and
  Try again when exhausted. Badge `!` when exhausted.
- Globe: arc to the active proxy, backups as faint points, silent ones in red.

## Messages

`SET_FAILOVER { enabled?, order? }`, `RETRY_FAILOVER`; `BgState.failover`.

## Testing

- `tests/failover.test.ts`: chain, candidates, error filter, verify, moving on, all
  silent (identity kept through real `migrateData`), Direct reset, cooldown, offline,
  user switching away mid-way.
- Real Chrome and Firefox against local proxies: moves on when the proxy dies; with
  all dead, nothing leaves directly; identity follows.
