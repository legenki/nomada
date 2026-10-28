# Automatic proxy type detection — design

Date: 2026-10-29
Builds on: `2026-10-28-options-redesign-design.md`

## Goal

Let the user add a proxy without knowing its protocol: an **Auto** type tries
HTTP, SOCKS5 and HTTPS through Chrome and saves the one that works, reporting a
clear reason when none does (e.g. the `ERR_PROXY_CONNECTION_FAILED` case).

## Constraint

MV3 extensions can't open raw sockets, so the only way to test a protocol is to
route a real request through Chrome's proxy settings with that type.

## Probe (background)

New message `DETECT_PROXY { host, port, username, password }` →
`DetectResult { success, type?, place?, error? }`. Runs inside the commit queue
(`serialize`) so it never interleaves with ON/OFF/select.

For each type in `probeOrder(hasLogin)`:
- HTTP → SOCKS5 → HTTPS without a login; HTTP → HTTPS with one (Chrome can't
  authenticate SOCKS5). HTTP first because a SOCKS5 greeting sent to an HTTP
  proxy can hang until the timeout, while the reverse fails at once.
- Set a PAC script that routes only `ipwho.is` through the candidate; every
  other host keeps its current route: `DIRECT` while Nomada is off, the active
  profile's route while on (`routeBody()` in `proxy.ts`). A remote-PAC active
  profile can't be inlined → refuse with "turn Nomada off or pick the type".
- Look up `ipwho.is` from the worker. Success = a place whose IP differs from
  the user's real IP. The first success wins.
- Failure reasons, checked after each failed attempt:
  - the candidate challenged for auth more than the login allows →
    "rejected the username or password" / "needs a username and password";
  - a timeout, or a proxy error meaning the server can't be reached
    (`ERR_PROXY_CONNECTION_FAILED`, `ERR_NAME_NOT_RESOLVED`,
    `ERR_ADDRESS_UNREACHABLE`, `ERR_CONNECTION_REFUSED`,
    `ERR_CONNECTION_TIMED_OUT`) → "Can't connect to host:port …"; stop, other
    types would fail the same way;
  - otherwise try the next type. None left → "Couldn't get through as …".
- Finally (always) re-apply the stored state with `applyProxy(readData())`.

Auth during the probe: `onAuthRequired` first offers the challenge to
`answerProbeChallenge(challengerHost)`: the first challenge from the candidate
host gets the probe credentials, any further one is cancelled and counted.
`onProxyError` forwards errors to `noteProxyError()`.

Place lookups (`refreshRealPlace`, `refreshProxyPlace`) wait for the commit
queue to go idle first, so a lookup can't be routed through a candidate.

`routeBody()` also fixes routing-rule PACs for HTTPS profiles, which used the
`PROXY` keyword instead of `HTTPS`.

## Options UI

- Type control: **Auto** · HTTP · HTTPS · SOCKS5 · PAC. New proxies default to
  Auto; edited ones show their saved type (Auto re-detects).
- Save with Auto: button shows "Checking…", the probe runs, the detected type is
  saved (storage schema unchanged). A blank name becomes the exit city. Toast:
  `Added “Berlin” · HTTP · Berlin, Germany`.
- Probe failure: error under the type control, dialog stays open. Closing the
  dialog while checking discards the save.
- Paste: `parseProxyString(text)` returns `type: null` when the text names no
  scheme; the form keeps its type, except PAC (→ Auto) and SOCKS5 with a login
  (→ Auto).

## Privacy

`PRIVACY.md`: ipwho.is is also contacted, through the proxy being checked, when
a proxy is saved with automatic type detection.

## Testing

- `tests/proxy.test.ts`: `pacRoute`, `routeBody`.
- `tests/detect.test.ts`: order, probe PAC routing, success/real-IP/auth/
  unreachable/timeout paths, refusal for remote-PAC active profile, restore
  always runs (Chrome APIs, places and storage mocked).
- `tests/parse.test.ts`: `type: null` for scheme-less input.
- Manual: real Chrome with an HTTP, a SOCKS5 and a dead proxy. Proxy auth from
  the service worker relies on `onAuthRequired` seeing the worker's request, as
  the existing location lookup already does.
