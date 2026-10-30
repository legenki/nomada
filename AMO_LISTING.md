# Nomada — addons.mozilla.org listing

Package: `nomada-firefox.zip` · Source: `nomada-firefox-source.zip` (both from
`npm run package:firefox`) · Build steps: `BUILD.md`.

## Name
```
Nomada — Location Guard, Locale & Proxy
```

## Summary
*Max 250 characters.*
```
Route your browser through a proxy and match its location, timezone and language — so sites see one consistent place.
```

## Description
```
Nomada moves your browser to wherever your proxy is. Flip one switch and your traffic goes through the proxy — and your geolocation, timezone and language change to match its location automatically, so every signal a website reads points to the same place.

A proxy alone hides your IP, but your timezone, language and location still give you away. Nomada keeps them all in sync with the proxy.

HOW IT WORKS

🔌 Add your proxy
Paste it in any common format — host:port, host:port:user:pass, user:pass@host:port or socks5://… — and Nomada fills in the rest. Leave the type on Auto and it checks whether the proxy speaks HTTP, SOCKS5 or HTTPS, finds the country it exits in, and tells you plainly if the proxy can't be reached or rejects the login. SOCKS5 proxies with a username and password work too.

🔁 Backup proxies
Put your proxies in order and switch on Failover: if one stops answering, Nomada moves to the next, and your location, timezone and language move with it. If none answers, requests are blocked rather than exposing your real IP.

🗂 Public proxies, ready to try
No proxy yet? The settings page shows a gallery of public proxies that are checked every few hours — only working ones, with their country and speed. Filter by country or by HTTP / SOCKS5 and add one with a click. They're run by strangers, so use them to see a site from another country, not to sign in or pay.

🏳️ Know where every proxy goes
Each proxy shows the flag of the country it exits in, and the one in use is highlighted with its status and city.

⚡ Switch Nomada on
Traffic goes through the proxy. Nomada looks up where the proxy's exit IP is and matches your browser to it:
• Geolocation reports the proxy's coordinates
• Timezone and clock follow the proxy's timezone
• Language (navigator.language and the Accept-Language header) and regional formatting follow the proxy's country

🌍 See where you are
The popup globe shows your real location while Nomada is off, and the proxy's location — with your route there — while it's on, along with the local time, language and IP sites see.

🛡️ No leaks around the proxy
If the proxy stops answering, requests fail instead of going out directly. DNS lookups go through SOCKS5 proxies, and WebRTC can't reveal your real IP.

GOOD TO KNOW
• Private windows: allow Nomada under "Run in Private Windows" in about:addons if you want it there too.
• Nomada needs access to all sites — that's how the proxy and the matching location reach every page. If you take that access away, the popup offers to give it back.
• PAC-script proxies aren't supported in Firefox.

PRIVACY
Nomada stores all settings locally in your browser. It does not collect, sell or transmit your personal data. To show and match locations it asks ipwho.is where an IP address is: your own IP while Nomada is off, the proxy's exit IP while it's on, and — once, through that proxy only — a proxy you save with the Auto type.
```

## Categories
Privacy & Security · Web Development

## Tags
proxy, geolocation, timezone, language, privacy, socks5

## Support
Email / website: *(fill in)*

## License
*(choose on AMO — e.g. "All Rights Reserved" or an open-source license)*

## Privacy policy
Paste `PRIVACY.md`.

## Screenshots
`store-assets/screenshot-1-popup.png`, `screenshot-2-proxies.png`,
`screenshot-3-add-proxy.png`, `screenshot-4-public-proxies.png` (1280×800; the UI is the same in Firefox).

---

## Notes to reviewer
```
Build: the extension is TypeScript bundled and minified with Vite. Sources are attached (nomada-firefox-source.zip); BUILD.md has the steps: `npm ci && npm run build:firefox` → dist-firefox/ (the submitted files). Tested with Node 26.12.1 / npm 11.20.0.

Network: the only remote service is https://ipwho.is (IP → location), declared as locationInfo in data_collection_permissions. No analytics or remote code.

proxy.onRequest routes traffic through the proxy the user configured. While Nomada is on, each answer is [proxyInfo, null], so a dead proxy fails the request rather than falling back to a direct connection. While it's off the listener returns undefined (the browser's own settings apply).

Content scripts (spoof-main.js in the MAIN world, spoof-bridge.js isolated) are registered only while Nomada is on; they override Date/Intl/navigator.language/geolocation with the proxy location's values.

innerHTML in popup.js / options.js renders the proxy list from the user's own settings and the public proxy gallery; every value is passed through an HTML-escaping function (src/lib/html.ts escHtml) or is a constant.

Public proxy gallery: the settings page downloads https://raw.githubusercontent.com/legenki/nomada/proxy-list/proxies.json — data only (no code), built every 6 hours by the repository's GitHub Actions job (tools/proxy-list). The JSON is validated entry by entry before use (src/lib/public-proxies.ts parsePublicList: IPv4 host, port range, type, country code).
```
