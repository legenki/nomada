# Privacy Policy — Nomada

_Last updated: 2026-10-29_

Nomada ("the extension") is a browser extension for Chrome and Firefox that
routes your browser through a proxy you configure and matches your browser's
reported geolocation, timezone and language to that proxy's location. This
policy explains what data the extension handles and how.

## Summary

**Nomada does not collect, store, sell, or transmit your personal data to us
or to any third party for tracking or advertising.** All your settings stay on
your own device.

## Data stored locally

The extension saves the following on your device using the browser's local
storage (`storage.local`). This data never leaves your browser except as
described under "Network requests" below:

- Your proxy profiles, including any proxy username and password you enter
- Which profile is selected and whether Nomada is on
- The last looked-up location of your own IP and of the proxy's exit IP
  (city, country, coordinates, timezone, IP address), so the popup can show them

Proxy credentials are stored locally only so the extension can authenticate to
the proxy you configured. They are sent only to that proxy server, by your own
browser, as part of normal proxy authentication.

While Nomada is on, the proxy's timezone, language and coordinates are also kept
where pages can be shown them — the browser's session storage in Chrome, its
local storage in Firefox. They are removed when Nomada is turned off (and, in
Chrome, when the browser closes).

## Network requests

Nomada contacts one service, **ipwho.is** (`https://ipwho.is`), to look up the
approximate location (country, city, coordinates, timezone) of an IP address:

- **Your own IP** — when you open the popup while Nomada is off, at most once
  every 10 minutes, to show where you are.
- **The proxy's exit IP** — when you switch Nomada on or change proxies, and when
  you open the popup while it's on (at most once every 10 minutes), to match
  your browser to the proxy's location.
- **A proxy you save with the "Auto" type** — once per type tried, through that
  proxy only, to find out which proxy type it speaks and where it exits.

Nomada sends nothing in these requests beyond what any HTTP request carries
(the IP the request comes from, as seen by ipwho.is). See ipwho.is's own privacy
terms for how they handle it.

The settings page also downloads the list of public proxies from GitHub
(`raw.githubusercontent.com`, at most every 3 hours, or when you refresh it).
Nothing about you is sent with that request beyond what any download carries.

**Public proxies** in that list are run by third parties, not by Nomada. If you
choose one, your browsing goes through a server operated by someone unknown: it
can see which sites you visit and read or change anything not sent over HTTPS.
Don't use public proxies to sign in, pay, or send anything private.

No other analytics, telemetry, or tracking requests are made by the extension.

## Permissions

Nomada requests browser permissions only to provide its features:

- **proxy** — route your traffic through a proxy you configure
- **storage** — save your settings locally
- **scripting** — while Nomada is on, add a script to pages that makes them see
  the proxy's timezone, language and location; and run the IP lookup inside
  your active tab so it leaves through the same proxy as your pages
- **declarativeNetRequest** — set the language your browser announces to sites
  (the Accept-Language header) to the proxy country's language
- **privacy** — while a proxy is active, stop WebRTC from revealing your real
  IP outside the proxy
- **webRequest / webRequestAuthProvider** — supply credentials to the
  authenticated proxy you configured
- **host access to all sites** — the proxy's location, timezone and language
  must apply to every site you visit

## Data sharing

We do not share, sell, or rent your data. We do not have servers that receive
your data.

## Children

Nomada is not directed at children under 13.

## Changes

If this policy changes, the updated version will be posted at this URL with a
new "Last updated" date.

## Contact

For questions about this policy, contact: andylegenki@gmail.com
