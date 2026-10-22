# Privacy Policy — Nomada

_Last updated: 2026-10-22_

Nomada ("the extension") is a browser extension that lets you change your
browser's reported geolocation, timezone, locale, and proxy settings. This
policy explains what data the extension handles and how.

## Summary

**Nomada does not collect, store, sell, or transmit your personal data to us
or to any third party for tracking or advertising.** All your settings stay on
your own device.

## Data stored locally

The extension saves the following on your device using the browser's local
storage (`chrome.storage.local`). This data never leaves your browser except as
described under "Network requests" below:

- Your chosen location (city, latitude, longitude, timezone, locale)
- Whether the extension is enabled
- Your proxy profiles, including any proxy username and password you enter
- Your preferences (e.g. dismissed sync suggestions)

Proxy credentials are stored locally only so the extension can authenticate to
the proxy you configured. They are never sent anywhere except to that proxy
server, by your own browser, as part of normal proxy authentication.

## Network requests

Nomada contacts one service, **ipwho.is** (`https://ipwho.is`), to look up the
approximate location (country, city, coordinates, timezone) of the IP address
your traffic currently exits from — your proxy's IP when a proxy is active. It
does so in two cases:

- **"Use my IP location"** — when you click this button.
- **Proxy sync suggestions** — automatically when you open the popup while a
  proxy profile is active, at most once every 10 minutes, to offer matching your
  location to the proxy's country. You can dismiss a suggestion; the countries
  you dismissed are stored locally.

Nomada sends nothing in these requests beyond what any HTTP request carries
(your exit IP, as seen by ipwho.is). See ipwho.is's own privacy terms for how
they handle it.

No other analytics, telemetry, or tracking requests are made by the extension.

## Permissions

Nomada requests browser permissions only to provide its features:

- **proxy** — route your traffic through a proxy you configure
- **storage** — save your settings locally
- **debugger** — override geolocation, timezone, locale and the browser
  language (the only browser API able to do this per tab)
- **scripting** — run the IP lookup inside your active tab, so it leaves through
  the same proxy as your pages (in an isolated context pages can't see)
- **privacy** — while a proxy is active, stop WebRTC from revealing your real
  IP outside the proxy
- **webNavigation** — re-apply your location override when you navigate
- **webRequest / webRequestAuthProvider** — supply credentials to the
  authenticated proxy you configured
- **host access to all sites** — your location and proxy settings must apply to
  every site you visit

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
